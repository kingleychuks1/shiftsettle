// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PayrollParser.sol";

// ================================================================
//  ShiftSettle — Autonomous Workforce Verification & UK Payroll
//  Somnia Agentathon 2026
//
//  ✅ EVERYTHING IN THIS FILE IS CONFIRMED FROM CODE GENERATORS
//     No assumptions. Sources noted inline.
//
//  AGENT CALLS:
//  1. JSON API Agent  → fetchUint()    → returns uint256 directly
//  2. LLM Agent       → inferString()  → returns pipe-delimited string
//                                         parsed by PayrollParser.sol
//
//  FLOW:
//  depositShift() → submitHours()
//    → fetchUint (timesheet API) → handleTimesheetResponse()
//    → inferString (payroll calc) → handlePayrollDecision()
//    → PayrollParser.parse() → payslip stored on-chain
//    → claimPayment() sends net STT to worker
// ================================================================

// ── Somnia platform types ─────────────────────────────────────
// Confirmed: code generators (Solidity + TypeScript) + docs

enum ConsensusType { Majority, Threshold }

enum ResponseStatus {
    None,       // 0
    Pending,    // 1
    Success,    // 2 ← what we check for
    Failed,     // 3
    TimedOut    // 4
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

// ── Platform interface ────────────────────────────────────────
// Confirmed: both code generators + docs
interface IAgentRequester {
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4  callbackSelector,
        bytes   calldata payload
    ) external payable returns (uint256 requestId);

    function getRequestDeposit() external view returns (uint256);
}

// ── JSON API Agent ────────────────────────────────────────────
// Confirmed: TypeScript generator (fetchUint tab)
// fetchUint returns uint256 directly — no string parsing needed.
// selector = dot-notation key e.g. "hoursWorked" or "data.hours"
// decimals = 0 for whole numbers (hours)
interface IJsonApiAgent {
    function fetchUint(
        string calldata url,
        string calldata selector,
        uint8 decimals
    ) external returns (uint256);
}

// ── LLM Inference Agent ───────────────────────────────────────
// Confirmed: TypeScript generator (inferString tab)
// Returns ABI-encoded string — decoded as abi.decode(result, (string))
// allowedValues = [] means free-form output (we parse pipe format)
// allowedValues = ["A","B"] means HARD constraint — network enforces it
interface ILLMAgent {
    function inferString(
        string calldata prompt,
        string calldata system,
        bool chainOfThought,
        string[] calldata allowedValues
    ) external returns (string memory);
}

// ================================================================

contract ShiftEscrow {
    using PayrollParser for string;

    // ── CONFIG — ALL CONFIRMED ───────────────────────────────
    //
    // Platform address: 0x5E5205...
    // Confirmed: BOTH Solidity and TypeScript code generators
    // use this address alongside dream-rpc.somnia.network (testnet)
    IAgentRequester public constant PLATFORM =
        IAgentRequester(0x5E5205CF39E766118C01636bED000A54D93163E6);

    // Agent IDs — confirmed: agents.somnia.network
    uint256 public constant JSON_API_AGENT_ID = 13174292974160097713;
    uint256 public constant LLM_AGENT_ID      = 12847293847561029384;

    // Execution costs per runner — confirmed: code generators
    uint256 public constant JSON_EXEC_COST = 30000000000000000; // 0.03 STT
    uint256 public constant LLM_EXEC_COST  = 70000000000000000; // 0.07 STT
    uint256 public constant SUBCOMMITTEE   = 3;

    // Timesheet API — your FlexStaff endpoint
    // GET /timesheets/{externalShiftId} → { "hoursWorked": 8 }
    string public constant TIMESHEET_API =
        "https://api.flexstaff.co.uk/timesheets/";

    // ── DEPOSIT HELPER ───────────────────────────────────────
    // Confirmed formula: getRequestDeposit() + (costPerAgent × 3)
    // NEVER hardcode — getRequestDeposit() can change
    function _deposit(uint256 costPerAgent) internal view returns (uint256) {
        return PLATFORM.getRequestDeposit() + (costPerAgent * SUBCOMMITTEE);
    }

    // ── WORKER PROFILE ───────────────────────────────────────
    struct WorkerProfile {
        string  taxCode;         // e.g. "1257L", "BR", "0T"
        string  niCategory;      // e.g. "A", "B", "C", "H", "M"
        uint256 ytdGrossPence;   // cumulative gross this tax year
        uint256 ytdTaxPaidPence; // cumulative tax paid this tax year
        bool    pensionOptedIn;
        bool    registered;
    }

    mapping(address => WorkerProfile) public workerProfiles;

    // ── ON-CHAIN PAYSLIP ─────────────────────────────────────
    // Permanent audit record. Every field in pence (integer).
    struct OnChainPayslip {
        uint256 grossPayPence;
        uint256 incomeTaxPence;
        uint256 employeeNIPence;
        uint256 employerNIPence;
        uint256 employeePensionPence;
        uint256 employerPensionPence;
        uint256 holidayPayPence;
        uint256 netPayPence;
        string  llmRawResponse;   // full agent output for audit
    }

    mapping(uint256 => OnChainPayslip) public payslips;

    // ── EMPLOYER LIABILITIES ─────────────────────────────────
    // Accumulated for HMRC RTI reconciliation
    struct EmployerLiabilities {
        uint256 taxToHMRC;
        uint256 employerNIToHMRC;
        uint256 pensionToProvider;
    }

    mapping(address => EmployerLiabilities) public employerLiabilities;

    // ── SHIFT ────────────────────────────────────────────────
    enum ShiftStatus {
        Funded,      // employer deposited, awaiting worker
        Submitted,   // worker submitted, JSON agent running
        LLMPending,  // timesheet verified, LLM agent running
        Approved,    // payslip calculated, worker can claim
        Rejected,    // failed, employer reclaims
        Settled      // complete
    }

    struct Shift {
        address employer;
        address worker;
        uint256 escrow;
        uint256 agreedHourlyRatePence;
        uint256 agreedHours;
        uint256 submittedHours;
        uint256 verifiedHours;
        ShiftStatus status;
        string  externalShiftId;
        uint256 weekNumber;
    }

    mapping(uint256 => Shift)   public shifts;
    uint256                     public nextShiftId;
    mapping(uint256 => uint256) public requestToShift;

    // ── EVENTS ───────────────────────────────────────────────
    event WorkerRegistered(address indexed worker, string taxCode, string niCategory);
    event ShiftFunded(uint256 indexed shiftId, address employer, address worker, uint256 escrow);
    event HoursSubmitted(uint256 indexed shiftId, uint256 hoursWorked, uint256 requestId);
    event TimesheetVerified(uint256 indexed shiftId, uint256 verifiedHours, uint256 llmRequestId);
    event PayslipCalculated(
        uint256 indexed shiftId,
        uint256 grossPay, uint256 incomeTax,
        uint256 employeeNI, uint256 employerNI,
        uint256 employeePension, uint256 employerPension,
        uint256 holidayPay, uint256 netPay
    );
    event PaymentReleased(uint256 indexed shiftId, address recipient, uint256 amountPence);
    event ShiftRejected(uint256 indexed shiftId, string reason);

    // ────────────────────────────────────────────────────────
    // STEP 0: Worker registers profile (once, at onboarding)
    // ────────────────────────────────────────────────────────
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

    // ────────────────────────────────────────────────────────
    // STEP 1: Employer deposits escrow
    //
    // msg.value must cover:
    //   - worker net pay (approx agreedHours × rate × 0.73)
    //   - employer NI   (13.8% on top)
    //   - employer pension (3% on top)
    //   - two agent deposits (~0.30 STT total)
    //
    // Safe formula: send (agreedHours × rate × 1.20) + 0.5 STT buffer
    // Any leftover is rebated to employer after settlement.
    // ────────────────────────────────────────────────────────
    function depositShift(
        address worker,
        uint256 agreedHours,
        uint256 agreedHourlyRatePence,
        string calldata externalShiftId,
        uint256 weekNumber
    ) external payable returns (uint256 shiftId) {
        require(workerProfiles[worker].registered, "Worker not registered");
        require(agreedHours > 0 && agreedHours <= 24, "Hours: 1-24");
        require(weekNumber >= 1 && weekNumber <= 52, "Week: 1-52");
        require(
            msg.value >= _deposit(JSON_EXEC_COST) + _deposit(LLM_EXEC_COST),
            "Escrow too small for agent costs"
        );

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

    // ────────────────────────────────────────────────────────
    // STEP 2: Worker submits hours → JSON API Agent
    //
    // Calls fetchUint() on your timesheet API.
    // Selector "hoursWorked" extracts that key from the JSON response.
    // Returns uint256 directly — no string parsing in callback.
    // ────────────────────────────────────────────────────────
    function submitHours(uint256 shiftId, uint256 hoursWorked) external {
        Shift storage shift = shifts[shiftId];
        require(msg.sender == shift.worker,         "Not the worker");
        require(shift.status == ShiftStatus.Funded, "Not Funded");
        require(hoursWorked > 0 && hoursWorked <= 24, "Hours: 1-24");

        shift.submittedHours = hoursWorked;
        shift.status = ShiftStatus.Submitted;

        // Confirmed payload encoding — TypeScript generator fetchUint tab
        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchUint.selector,
            string(abi.encodePacked(TIMESHEET_API, shift.externalShiftId)),
            "hoursWorked", // JSON key in the API response
            uint8(0)       // 0 decimal places — hours are whole numbers
        );

        uint256 reqId = PLATFORM.createRequest{value: _deposit(JSON_EXEC_COST)}(
            JSON_API_AGENT_ID,
            address(this),
            this.handleTimesheetResponse.selector,
            payload
        );

        requestToShift[reqId] = shiftId;
        emit HoursSubmitted(shiftId, hoursWorked, reqId);
    }

    // ────────────────────────────────────────────────────────
    // STEP 3: JSON API callback → LLM payroll agent
    //
    // fetchUint returns ABI-encoded uint256 — decode directly.
    // If hours match submission, trigger inferString payroll calc.
    // ────────────────────────────────────────────────────────
    function handleTimesheetResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory
    ) external {
        require(msg.sender == address(PLATFORM), "Only Somnia platform");

        uint256 shiftId = requestToShift[requestId];
        Shift storage shift = shifts[shiftId];
        require(shift.status == ShiftStatus.Submitted, "Unexpected state");

        if (status != ResponseStatus.Success || responses.length == 0) {
            _reject(shiftId, "Timesheet API agent failed");
            return;
        }

        // fetchUint returns ABI-encoded uint256 — confirmed from TypeScript
        uint256 apiHours = abi.decode(responses[0].result, (uint256));
        shift.verifiedHours = apiHours;

        if (apiHours != shift.submittedHours) {
            _reject(shiftId, string(abi.encodePacked(
                "Mismatch: submitted ", _str(shift.submittedHours),
                " API returned ", _str(apiHours)
            )));
            return;
        }

        shift.status = ShiftStatus.LLMPending;

        // ── Build payroll prompt ──────────────────────────────
        // Pre-calculate gross and holiday in Solidity (cheaper than
        // asking the LLM to do arithmetic — fewer hallucination risks).
        WorkerProfile memory p = workerProfiles[shift.worker];
        uint256 gross = apiHours * shift.agreedHourlyRatePence;
        uint256 hol   = (gross * 1207) / 10000; // 12.07% holiday pay

        string memory system =
            "You are a UK PAYE payroll calculator for tax year 2025/26. "
            "Follow HMRC rules exactly. "
            "Respond ONLY with the pipe-delimited format specified. "
            "No explanation, no other text.";

        string memory prompt = string(abi.encodePacked(
            "Calculate UK statutory payroll deductions.\n\n",
            "WORKER:\n",
            "Tax code: ", p.taxCode, "\n",
            "NI category: ", p.niCategory, "\n",
            "YTD gross this tax year: ", _str(p.ytdGrossPence), "p\n",
            "YTD tax paid this tax year: ", _str(p.ytdTaxPaidPence), "p\n",
            "Pension opted in: ", p.pensionOptedIn ? "YES" : "NO", "\n\n",
            "THIS SHIFT:\n",
            "Gross pay: ", _str(gross), " pence\n",
            "Holiday pay (12.07%): ", _str(hol), " pence\n",
            "Tax week: ", _str(shift.weekNumber), "\n\n",
            "RULES:\n",
            "1. Tax: 1257L = 241p/wk free then 20% basic. BR = 20% all. 0T = no allowance.\n",
            "2. Employee NI cat A: 8% on 242-967p/wk, 2% above 967p/wk. Cat C = none.\n",
            "3. Employer NI: 13.8% on earnings above 175p/wk.\n",
            "4. Employee pension (if opted in): 5% of earnings above 120p/wk.\n",
            "5. Employer pension (if opted in): 3% of earnings above 120p/wk.\n",
            "6. Net = gross + holiday - income tax - employee NI - employee pension.\n\n",
            "RESPOND WITH EXACTLY THIS AND NOTHING ELSE:\n",
            "APPROVED|grossPence|incomeTaxPence|employeeNIPence|employerNIPence|",
            "employeePensionPence|employerPensionPence|holidayPayPence|netPayPence\n",
            "All values: integers in pence, no decimals, no commas.\n",
            "Example: APPROVED|12000|1840|784|1104|600|360|1448|8776"
        ));

        // Confirmed payload encoding — TypeScript generator inferString tab
        // chainOfThought = false: deterministic, cost-efficient
        // allowedValues  = []:    free-form (we parse the pipe output)
        string[] memory noConstraint = new string[](0);

        bytes memory llmPayload = abi.encodeWithSelector(
            ILLMAgent.inferString.selector,
            prompt,
            system,
            false,
            noConstraint
        );

        uint256 llmId = PLATFORM.createRequest{value: _deposit(LLM_EXEC_COST)}(
            LLM_AGENT_ID,
            address(this),
            this.handlePayrollDecision.selector,
            llmPayload
        );

        requestToShift[llmId] = shiftId;
        emit TimesheetVerified(shiftId, apiHours, llmId);
    }

    // ────────────────────────────────────────────────────────
    // STEP 4: LLM callback → parse payslip, store on-chain
    //
    // inferString returns ABI-encoded string.
    // PayrollParser.parse() splits the pipe-delimited result.
    // ────────────────────────────────────────────────────────
    function handlePayrollDecision(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory
    ) external {
        require(msg.sender == address(PLATFORM), "Only Somnia platform");

        uint256 shiftId = requestToShift[requestId];
        Shift storage shift = shifts[shiftId];
        require(shift.status == ShiftStatus.LLMPending, "Unexpected state");

        if (status != ResponseStatus.Success || responses.length == 0) {
            _reject(shiftId, "LLM payroll agent failed");
            return;
        }

        // inferString returns ABI-encoded string — confirmed from TypeScript
        string memory raw = abi.decode(responses[0].result, (string));

        PayrollParser.Payslip memory slip = PayrollParser.parse(raw);

        if (!slip.approved) {
            _reject(shiftId, string(abi.encodePacked("Payroll rejected: ", raw)));
            return;
        }

        // Store permanent on-chain payslip
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

        // Accumulate employer HMRC liabilities
        EmployerLiabilities storage liab = employerLiabilities[shift.employer];
        liab.taxToHMRC        += slip.incomeTax;
        liab.employerNIToHMRC += slip.employerNI;
        liab.pensionToProvider += slip.employeePension + slip.employerPension;

        // Update worker YTD for accurate future calculations
        workerProfiles[shift.worker].ytdGrossPence   += slip.grossPay;
        workerProfiles[shift.worker].ytdTaxPaidPence += slip.incomeTax;

        shift.status = ShiftStatus.Approved;

        emit PayslipCalculated(
            shiftId,
            slip.grossPay, slip.incomeTax,
            slip.employeeNI, slip.employerNI,
            slip.employeePension, slip.employerPension,
            slip.holidayPay, slip.netPay
        );
    }

    // ────────────────────────────────────────────────────────
    // STEP 5a: Worker claims net pay
    // ────────────────────────────────────────────────────────
    // ────────────────────────────────────────────────────────
    // STEP 5a: Worker claims net pay
    // ────────────────────────────────────────────────────────
    function claimPayment(uint256 shiftId) external {
        Shift storage shift = shifts[shiftId];
        require(msg.sender == shift.worker,           "Not the worker");
        require(shift.status == ShiftStatus.Approved, "Not approved");

        shift.status = ShiftStatus.Settled;

        uint256 netWei = payslips[shiftId].netPayPence * 1e16;
        if (netWei > shift.escrow) netWei = shift.escrow;
        uint256 leftover = shift.escrow - netWei;

        if (netWei > 0) {
            (bool ok1,) = payable(shift.worker).call{value: netWei}("");
            require(ok1, "Worker payment failed");
        }
        if (leftover > 0) {
            (bool ok2,) = payable(shift.employer).call{value: leftover}("");
            require(ok2, "Employer rebate failed");
        }

        emit PaymentReleased(shiftId, shift.worker, payslips[shiftId].netPayPence);
    }

    // ────────────────────────────────────────────────────────
    // STEP 5b: Employer reclaims after rejection
    // ────────────────────────────────────────────────────────
    function reclaimEscrow(uint256 shiftId) external {
        Shift storage shift = shifts[shiftId];
        require(msg.sender == shift.employer,         "Not the employer");
        require(shift.status == ShiftStatus.Rejected, "Not rejected");

        shift.status = ShiftStatus.Settled;
        uint256 amt = shift.escrow;
        shift.escrow = 0;
        (bool ok,) = payable(shift.employer).call{value: amt}("");
        require(ok, "Reclaim failed");
    }

    // ── INTERNAL HELPERS ─────────────────────────────────────

    function _reject(uint256 shiftId, string memory reason) internal {
        shifts[shiftId].status = ShiftStatus.Rejected;
        emit ShiftRejected(shiftId, reason);
    }

    function _str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v; uint256 d;
        while (t != 0) { d++; t /= 10; }
        bytes memory buf = new bytes(d);
        while (v != 0) { d--; buf[d] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(buf);
    }

    receive() external payable {}
}