// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PayrollParser.sol";

// ============================================================
//  ShiftSettle — Autonomous Workforce Verification & UK Payroll
//  Built for Somnia Agentathon 2026
//
//  ALL VALUES CONFIRMED from agents.somnia.network code generator
//  (see AGENTS_REFERENCE.md for full cheat sheet)
//
//  FLOW:
//  1. Worker registers profile (tax code, NI, YTD, pension)
//  2. Employer depositShift() — escrow covers gross + employer NI + pension
//  3. Worker submitHours() → JSON API Agent fetches verified hours
//  4. JSON callback → LLM Payroll Agent calculates all deductions
//  5. LLM callback → PayrollParser decodes pipe-delimited payslip
//  6. Worker claimPayment() receives NET pay
//     Employer liabilities (tax, NI, pension) stored on-chain for HMRC
// ============================================================

// ── Somnia platform types (identical to code generator output) ──

enum ConsensusType { Majority, Threshold }

enum ResponseStatus {
    None,      // 0 - uninitialised
    Pending,   // 1 - awaiting responses
    Success,   // 2 - consensus reached
    Failed,    // 3 - validators reported failure
    TimedOut   // 4 - request timed out
}

struct Response {
    address validator;
    bytes   result;
    ResponseStatus status;
    uint256 receipt;
    uint256 timestamp;
    uint256 executionCost;
}

struct Request {
    uint256 id;
    address requester;
    address callbackAddress;
    bytes4  callbackSelector;
    address[] subcommittee;
    Response[] responses;
    uint256 responseCount;
    uint256 failureCount;
    uint256 threshold;
    uint256 createdAt;
    uint256 deadline;
    ResponseStatus status;
    ConsensusType consensusType;
    uint256 remainingBudget;
    uint256 perAgentBudget;
}

// ── Platform interface — CONFIRMED from code generator ──────────
interface IAgentRequester {
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4  callbackSelector,
        bytes   calldata payload
    ) external payable returns (uint256 requestId);

    // Returns the minimum floor deposit the contract requires.
    // MUST call this + add execution reward before invoking an agent.
    function getRequestDeposit() external view returns (uint256);
}

// ── Agent interfaces — CONFIRMED from code generator ────────────
// These exist solely for .selector and ABI-encoding.
// We never actually call these contracts directly.

interface IJsonApiAgent {
    // Fetches a value from a public JSON API.
    // url:      full URL of the JSON API endpoint
    // selector: dot-notation key path e.g. "hoursWorked" or "data.hours"
    // Returns:  ABI-encoded string (e.g. "8") — parse to uint in callback
    function fetchString(
        string memory url,
        string memory selector
    ) external returns (string memory);
}

interface ILLMAgent {
    // Runs deterministic LLM inference (Qwen3-30B) across validator network.
    // prompt:        user prompt
    // system:        system prompt (sets the model's role/persona)
    // chainOfThought: true = show reasoning steps (slower, non-deterministic friendly)
    //                 false = direct answer only (faster, more deterministic)
    // allowedValues: if non-empty, output is CONSTRAINED to one of these strings.
    //                The network enforces this — hallucination impossible.
    //                Pass empty array [] for free-form output.
    // Returns:       ABI-encoded string
    function inferString(
        string memory prompt,
        string memory system,
        bool chainOfThought,
        string[] memory allowedValues
    ) external returns (string memory);
}

// ============================================================

contract ShiftEscrow {
    using PayrollParser for string;

    // ----------------------------------------------------------
    // CONFIG — ALL CONFIRMED from agents.somnia.network
    // ----------------------------------------------------------

    // ✅ Platform contract — CONFIRMED (testnet)
    IAgentRequester public constant PLATFORM =
        IAgentRequester(0x5E5205CF39E766118C01636bED000A54D93163E6);

    // ✅ Agent IDs — CONFIRMED
    uint256 public constant JSON_API_AGENT_ID      = 13174292974160097713;
    uint256 public constant LLM_AGENT_ID           = 12847293847561029384;
    uint256 public constant LLM_PARSE_WEB_AGENT_ID = 12875401142070969085; // unused in v1

    // ✅ Execution costs per runner — CONFIRMED from code generator
    // JSON API: 0.03 STT per runner
    uint256 public constant JSON_API_EXECUTION_COST = 30000000000000000;
    // LLM Inference: 0.07 STT per runner
    uint256 public constant LLM_EXECUTION_COST      = 70000000000000000;

    // ✅ Subcommittee size — default is 3 (confirmed)
    uint256 public constant SUBCOMMITTEE_SIZE = 3;

    // Total deposit per agent call = platform floor + (cost × runners)
    // We calculate this dynamically in _deposit() using getRequestDeposit()
    // Approximate totals for reference:
    //   JSON API: floor + (0.03 × 3) = floor + 0.09 STT
    //   LLM:      floor + (0.07 × 3) = floor + 0.21 STT

    // Your timesheet API base URL
    // The JSON API agent will call: TIMESHEET_API + externalShiftId
    // and extract the "hoursWorked" field from the JSON response
    string public constant TIMESHEET_API = "https://api.flexstaff.co.uk/timesheets/";

    // ----------------------------------------------------------
    // DEPOSIT HELPER
    //
    // Why dynamic? The platform floor (getRequestDeposit()) can change.
    // Hardcoding it would cause "insufficient deposit" reverts silently.
    // Always calculate just before calling createRequest.
    // ----------------------------------------------------------

    function _deposit(uint256 executionCostPerAgent) internal view returns (uint256) {
        uint256 floor  = PLATFORM.getRequestDeposit();
        uint256 reward = executionCostPerAgent * SUBCOMMITTEE_SIZE;
        return floor + reward;
    }

    // ----------------------------------------------------------
    // WORKER PROFILE
    // ----------------------------------------------------------

    struct WorkerProfile {
        string  taxCode;           // e.g. "1257L", "BR", "0T"
        string  niCategory;        // e.g. "A", "B", "C", "H", "M"
        uint256 ytdGrossPence;     // cumulative gross this tax year
        uint256 ytdTaxPaidPence;   // cumulative tax paid this tax year
        bool    pensionOptedIn;
        bool    registered;
    }

    mapping(address => WorkerProfile) public workerProfiles;

    // ----------------------------------------------------------
    // ON-CHAIN PAYSLIP
    // Permanently stored per shift. Full UK statutory breakdown.
    // ----------------------------------------------------------

    struct OnChainPayslip {
        uint256 grossPayPence;
        uint256 incomeTaxPence;        // deducted from worker
        uint256 employeeNIPence;       // deducted from worker
        uint256 employerNIPence;       // employer liability (on top)
        uint256 employeePensionPence;  // deducted from worker
        uint256 employerPensionPence;  // employer liability (on top)
        uint256 holidayPayPence;       // 12.07% accrual
        uint256 netPayPence;           // worker receives this
        string  llmRawResponse;        // full agent output — on-chain audit
    }

    mapping(uint256 => OnChainPayslip) public payslips;

    // ----------------------------------------------------------
    // EMPLOYER HMRC LIABILITIES
    // Accumulated across all shifts. Exported for RTI submission.
    // ----------------------------------------------------------

    struct EmployerLiabilities {
        uint256 taxToHMRC;           // income tax collected on behalf of workers
        uint256 employerNIToHMRC;    // employer NI owed to HMRC
        uint256 pensionToProvider;   // total pension both sides
    }

    mapping(address => EmployerLiabilities) public employerLiabilities;

    // ----------------------------------------------------------
    // SHIFT
    // ----------------------------------------------------------

    enum ShiftStatus {
        Funded,      // employer deposited, awaiting worker
        Submitted,   // worker submitted hours, JSON agent running
        LLMPending,  // hours verified, LLM payroll agent running
        Approved,    // payslip calculated, worker can claim
        Rejected,    // failed, employer reclaims
        Settled      // done
    }

    struct Shift {
        address employer;
        address worker;
        uint256 escrow;
        uint256 agreedHourlyRatePence; // gross rate in pence e.g. 1500 = £15/hr
        uint256 agreedHours;
        uint256 submittedHours;
        uint256 verifiedHours;
        ShiftStatus status;
        string  externalShiftId;
        uint256 weekNumber;            // ISO week number for NI threshold calc
    }

    mapping(uint256 => Shift) public shifts;
    uint256 public nextShiftId;

    // Maps Somnia requestId → our shiftId so callbacks can find the right shift
    mapping(uint256 => uint256) public requestToShift;

    // ----------------------------------------------------------
    // EVENTS
    // ----------------------------------------------------------

    event WorkerRegistered(address indexed worker, string taxCode, string niCategory);
    event ShiftFunded(uint256 indexed shiftId, address employer, address worker, uint256 escrow);
    event HoursSubmitted(uint256 indexed shiftId, uint256 hours, uint256 agentRequestId);
    event TimesheetVerified(uint256 indexed shiftId, uint256 verifiedHours, uint256 llmRequestId);
    event PayslipCalculated(
        uint256 indexed shiftId,
        uint256 grossPay, uint256 incomeTax, uint256 employeeNI,
        uint256 employerNI, uint256 employeePension, uint256 employerPension,
        uint256 holidayPay, uint256 netPay
    );
    event PaymentReleased(uint256 indexed shiftId, address recipient, uint256 amountPence);
    event ShiftRejected(uint256 indexed shiftId, string reason);

    // ----------------------------------------------------------
    // STEP 0: Worker registers profile (once, at onboarding)
    // ----------------------------------------------------------

    function registerWorker(
        string calldata taxCode,
        string calldata niCategory,
        uint256 ytdGrossPence,
        uint256 ytdTaxPaidPence,
        bool pensionOptedIn
    ) external {
        workerProfiles[msg.sender] = WorkerProfile({
            taxCode:         taxCode,
            niCategory:      niCategory,
            ytdGrossPence:   ytdGrossPence,
            ytdTaxPaidPence: ytdTaxPaidPence,
            pensionOptedIn:  pensionOptedIn,
            registered:      true
        });
        emit WorkerRegistered(msg.sender, taxCode, niCategory);
    }

    // ----------------------------------------------------------
    // STEP 1: Employer deposits escrow and funds the shift
    //
    // How much to send (msg.value):
    //   At minimum: gross + employerNI (~13.8%) + employerPension (~3%)
    //   + agent deposits for both calls (~0.30 STT total)
    //   + a buffer for the escrow check below
    //
    // Formula: send (agreedHours * agreedHourlyRate * 1.20) STT + 0.5 STT buffer
    // Any leftover is returned to employer after settlement.
    // ----------------------------------------------------------

    function depositShift(
        address worker,
        uint256 agreedHours,
        uint256 agreedHourlyRatePence,
        string calldata externalShiftId,
        uint256 weekNumber
    ) external payable returns (uint256 shiftId) {
        require(workerProfiles[worker].registered, "Worker not registered");
        require(agreedHours > 0 && agreedHours <= 24, "Invalid hours: 1-24");
        require(weekNumber >= 1 && weekNumber <= 52, "Invalid week: 1-52");

        // Must have enough to cover at least both agent deposits
        uint256 minDeposit = _deposit(JSON_API_EXECUTION_COST) + _deposit(LLM_EXECUTION_COST);
        require(msg.value >= minDeposit, "Escrow too small for agent costs");

        shiftId = nextShiftId++;

        shifts[shiftId] = Shift({
            employer:              msg.sender,
            worker:                worker,
            escrow:                msg.value,
            agreedHourlyRatePence: agreedHourlyRatePence,
            agreedHours:           agreedHours,
            submittedHours:        0,
            verifiedHours:         0,
            status:                ShiftStatus.Funded,
            externalShiftId:       externalShiftId,
            weekNumber:            weekNumber
        });

        emit ShiftFunded(shiftId, msg.sender, worker, msg.value);
    }

    // ----------------------------------------------------------
    // STEP 2: Worker submits hours → JSON API Agent
    //
    // The agent calls TIMESHEET_API + externalShiftId and extracts
    // the "hoursWorked" field. Validated by 3 Somnia validators.
    // Returns ABI-encoded string (e.g. "8") — decoded in callback.
    // ----------------------------------------------------------

    function submitHours(uint256 shiftId, uint256 hoursWorked) external {
        Shift storage shift = shifts[shiftId];
        require(msg.sender == shift.worker, "Not the assigned worker");
        require(shift.status == ShiftStatus.Funded, "Not in Funded state");
        require(hoursWorked > 0 && hoursWorked <= 24, "Invalid hours: 1-24");

        shift.submittedHours = hoursWorked;
        shift.status = ShiftStatus.Submitted;

        string memory url = string(abi.encodePacked(TIMESHEET_API, shift.externalShiftId));

        // ✅ CONFIRMED payload encoding from agents.somnia.network code generator
        // fetchString(string url, string selector) → returns string
        // selector is the JSON key name, e.g. "hoursWorked"
        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchString.selector,
            url,
            "hoursWorked"   // key in the API response JSON
        );

        uint256 jsonDeposit = _deposit(JSON_API_EXECUTION_COST);

        uint256 agentRequestId = PLATFORM.createRequest{value: jsonDeposit}(
            JSON_API_AGENT_ID,
            address(this),
            this.handleTimesheetResponse.selector,
            payload
        );

        requestToShift[agentRequestId] = shiftId;
        emit HoursSubmitted(shiftId, hoursWorked, agentRequestId);
    }

    // ----------------------------------------------------------
    // STEP 3: JSON API callback → LLM Payroll Agent
    //
    // fetchString returns a string — parse it to uint256 here.
    // If hours match the submission, trigger the LLM payroll calculation.
    // ----------------------------------------------------------

    function handleTimesheetResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory
    ) external {
        require(msg.sender == address(PLATFORM), "Only Somnia platform");

        uint256 shiftId = requestToShift[requestId];
        Shift storage shift = shifts[shiftId];
        require(shift.status == ShiftStatus.Submitted, "Unexpected callback state");

        if (status != ResponseStatus.Success || responses.length == 0) {
            _rejectShift(shiftId, "Timesheet API agent failed or timed out");
            return;
        }

        // Decode the string result from the JSON API agent
        // e.g. result bytes decodes to "8"
        string memory hoursStr = abi.decode(responses[0].result, (string));

        // Parse string to uint256 using our PayrollParser utility
        uint256 apiHours = PayrollParser.parseUintFromString(hoursStr);

        shift.verifiedHours = apiHours;

        if (apiHours != shift.submittedHours) {
            _rejectShift(shiftId, string(abi.encodePacked(
                "Hours mismatch: worker submitted ",
                _toString(shift.submittedHours),
                " but timesheet API recorded ",
                _toString(apiHours)
            )));
            return;
        }

        // Hours verified. Trigger LLM payroll calculation.
        shift.status = ShiftStatus.LLMPending;

        WorkerProfile memory profile = workerProfiles[shift.worker];
        uint256 grossPence = apiHours * shift.agreedHourlyRatePence;
        uint256 holPence   = (grossPence * 1207) / 10000; // 12.07% holiday pay

        // ── SYSTEM PROMPT ────────────────────────────────────────
        // Sets the model's role. Keep short — every token costs gas.
        string memory system = "You are a UK PAYE payroll calculator. "
            "You follow HMRC rules precisely. "
            "You respond only in the exact format specified. No extra text.";

        // ── USER PROMPT ──────────────────────────────────────────
        // Contains all the data the LLM needs to calculate deductions.
        // We pre-calculate gross and holiday pay in Solidity to keep
        // the prompt shorter and the LLM's job simpler (fewer errors).
        string memory prompt = string(abi.encodePacked(
            "Calculate UK statutory payroll deductions.\n\n",

            "WORKER:\n",
            "Tax code: ", profile.taxCode, "\n",
            "NI category: ", profile.niCategory, "\n",
            "YTD gross this tax year: ", _toString(profile.ytdGrossPence), "p\n",
            "YTD income tax paid: ", _toString(profile.ytdTaxPaidPence), "p\n",
            "Pension opted in: ", profile.pensionOptedIn ? "YES" : "NO", "\n\n",

            "THIS SHIFT:\n",
            "Gross pay: ", _toString(grossPence), " pence\n",
            "Holiday pay (12.07%): ", _toString(holPence), " pence\n",
            "Tax week: ", _toString(shift.weekNumber), "\n\n",

            "RULES (apply in order):\n",
            "1. Tax: code 1257L = 24,200p/yr free (241p/wk), then 20% basic rate.\n",
            "   BR = 20% on all. 0T = no allowance. Use week number for weekly calc.\n",
            "2. Employee NI (cat A): 8% on earnings 242p-967p/wk, 2% above 967p/wk.\n",
            "   Cat C: no NI. Cat B/H/M: reduced rates per HMRC tables.\n",
            "3. Employer NI: 13.8% on earnings above 175p/wk.\n",
            "4. Employee pension (if opted in): 5% of earnings above 120p/wk.\n",
            "5. Employer pension (if opted in): 3% of earnings above 120p/wk.\n",
            "6. Net = gross + holiday - income tax - employee NI - employee pension.\n\n",

            "RESPOND WITH EXACTLY THIS LINE AND NOTHING ELSE:\n",
            "APPROVED|<grossPence>|<incomeTaxPence>|<employeeNIPence>|<employerNIPence>|<employeePensionPence>|<employerPensionPence>|<holidayPayPence>|<netPayPence>\n",
            "All values: integers in pence, no decimals, no commas, no currency symbols.\n",
            "Example: APPROVED|12000|1840|784|1104|600|360|1448|8776"
        ));

        // ✅ CONFIRMED payload encoding from agents.somnia.network code generator
        // inferString(string prompt, string system, bool chainOfThought, string[] allowedValues)
        // chainOfThought = false → direct answer, faster, more deterministic
        // allowedValues  = [] → free-form (we parse the pipe-delimited output ourselves)
        //
        // NOTE: If you want to do a binary APPROVED/REJECTED first and then
        // call inferString a second time for the numbers, set:
        //   allowedValues = ["APPROVED", "REJECTED"]
        // The network will enforce the constraint — impossible to hallucinate.
        // For the hackathon we combine both in one call to save agent cost.
        string[] memory noConstraint = new string[](0);

        bytes memory llmPayload = abi.encodeWithSelector(
            ILLMAgent.inferString.selector,
            prompt,
            system,
            false,         // chainOfThought off — deterministic, cost-efficient
            noConstraint   // no allowed values — we parse free-form output
        );

        uint256 llmDeposit = _deposit(LLM_EXECUTION_COST);

        uint256 llmRequestId = PLATFORM.createRequest{value: llmDeposit}(
            LLM_AGENT_ID,
            address(this),
            this.handlePayrollDecision.selector,
            llmPayload
        );

        requestToShift[llmRequestId] = shiftId;
        emit TimesheetVerified(shiftId, apiHours, llmRequestId);
    }

    // ----------------------------------------------------------
    // STEP 4: LLM callback → parse payslip, update liabilities
    // ----------------------------------------------------------

    function handlePayrollDecision(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory
    ) external {
        require(msg.sender == address(PLATFORM), "Only Somnia platform");

        uint256 shiftId = requestToShift[requestId];
        Shift storage shift = shifts[shiftId];
        require(shift.status == ShiftStatus.LLMPending, "Unexpected callback state");

        if (status != ResponseStatus.Success || responses.length == 0) {
            _rejectShift(shiftId, "LLM payroll agent failed to reach consensus");
            return;
        }

        string memory raw = abi.decode(responses[0].result, (string));

        // PayrollParser.parse() splits the pipe-delimited string and
        // returns a structured Payslip with all 8 deduction fields
        PayrollParser.Payslip memory slip = PayrollParser.parse(raw);

        if (!slip.approved) {
            _rejectShift(shiftId, string(abi.encodePacked("Payroll rejected: ", raw)));
            return;
        }

        // Store permanent on-chain payslip — full audit trail
        payslips[shiftId] = OnChainPayslip({
            grossPayPence:        slip.grossPay,
            incomeTaxPence:       slip.incomeTax,
            employeeNIPence:      slip.employeeNI,
            employerNIPence:      slip.employerNI,
            employeePensionPence: slip.employeePension,
            employerPensionPence: slip.employerPension,
            holidayPayPence:      slip.holidayPay,
            netPayPence:          slip.netPay,
            llmRawResponse:       raw
        });

        // Accumulate employer liabilities for HMRC reconciliation
        EmployerLiabilities storage liab = employerLiabilities[shift.employer];
        liab.taxToHMRC         += slip.incomeTax;
        liab.employerNIToHMRC  += slip.employerNI;
        liab.pensionToProvider += slip.employeePension + slip.employerPension;

        // Update worker YTD for accurate future shift calculations
        workerProfiles[shift.worker].ytdGrossPence   += slip.grossPay;
        workerProfiles[shift.worker].ytdTaxPaidPence += slip.incomeTax;

        shift.status = ShiftStatus.Approved;

        emit PayslipCalculated(
            shiftId,
            slip.grossPay, slip.incomeTax, slip.employeeNI,
            slip.employerNI, slip.employeePension, slip.employerPension,
            slip.holidayPay, slip.netPay
        );
    }

    // ----------------------------------------------------------
    // STEP 5a: Worker claims net pay
    // ----------------------------------------------------------

    function claimPayment(uint256 shiftId) external {
        Shift storage shift = shifts[shiftId];
        require(msg.sender == shift.worker, "Not the worker");
        require(shift.status == ShiftStatus.Approved, "Not approved");

        shift.status = ShiftStatus.Settled;

        OnChainPayslip memory slip = payslips[shiftId];

        // Convert pence to wei
        // Assumption: 1 STT treated as £1 equivalent for demo purposes
        // In production: add a price oracle (ironically, using Somnia JSON API agent!)
        uint256 netWei = slip.netPayPence * 1e16; // 1 pence = 1e16 wei

        if (netWei > shift.escrow) netWei = shift.escrow;

        uint256 leftover = shift.escrow - netWei;

        if (netWei > 0) {
            payable(shift.worker).transfer(netWei);
            emit PaymentReleased(shiftId, shift.worker, slip.netPayPence);
        }
        if (leftover > 0) {
            payable(shift.employer).transfer(leftover);
        }
    }

    // ----------------------------------------------------------
    // STEP 5b: Employer reclaims after rejection
    // ----------------------------------------------------------

    function reclaimEscrow(uint256 shiftId) external {
        Shift storage shift = shifts[shiftId];
        require(msg.sender == shift.employer, "Not the employer");
        require(shift.status == ShiftStatus.Rejected, "Not rejected");

        shift.status = ShiftStatus.Settled;
        uint256 amount = shift.escrow;
        shift.escrow = 0;
        payable(shift.employer).transfer(amount);
    }

    // ----------------------------------------------------------
    // INTERNAL HELPERS
    // ----------------------------------------------------------

    function _rejectShift(uint256 shiftId, string memory reason) internal {
        shifts[shiftId].status = ShiftStatus.Rejected;
        emit ShiftRejected(shiftId, reason);
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    receive() external payable {}
}
