// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ============================================================
//  ShiftSettle — Autonomous Workforce Verification & Payment
//  Built for Somnia Agentathon 2026
//
//  HOW IT WORKS (read this first):
//
//  1. An employer calls depositShift() with STT escrow. The shift
//     is now "funded" and waiting for the worker to submit hours.
//
//  2. A worker calls submitHours() when they've finished.
//     This triggers the FIRST Somnia Agent call: JSON API Request.
//     The agent fetches the worker's actual clock-in/out record
//     from an external timesheet API (e.g. your FlexStaff backend).
//
//  3. The JSON API agent calls back handleTimesheetResponse().
//     If the hours check out, a SECOND agent is triggered: LLM Inference.
//     The agent runs an on-chain AI model to validate edge cases
//     (disputes, partial hours, overtime rules) deterministically.
//
//  4. The LLM agent calls back handleLLMDecision().
//     If approved → worker can claim payment.
//     If rejected → employer's escrow is released back to them.
//
//  Zero humans required in the loop. That's the demo.
// ============================================================

// --- Somnia Agent Platform types (copy from docs or code generator) ---
// Visit https://agents.somnia.network to get agent IDs and generate
// the exact payload encoding for each agent you use.

enum ConsensusType { Majority, Threshold }

enum ResponseStatus {
    None,      // 0 - uninitialised
    Pending,   // 1 - awaiting validator responses
    Success,   // 2 - consensus reached
    Failed,    // 3 - validators reported failure
    TimedOut   // 4 - deadline passed
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

// Minimal interface — only what we actually call
interface IAgentRequester {
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4  callbackSelector,
        bytes   calldata payload
    ) external payable returns (uint256 requestId);
}

// ============================================================

contract ShiftEscrow {

    // ----------------------------------------------------------
    // CONFIG — swap these after checking agents.somnia.network
    // ----------------------------------------------------------

    // Testnet platform contract (from Somnia docs)
    IAgentRequester public constant PLATFORM =
        IAgentRequester(0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776);

    // Agent IDs: look these up at https://agents.somnia.network
    // JSON API Request agent — fetches timesheet data from your API
    uint256 public constant JSON_API_AGENT_ID = 1;   // ← UPDATE THIS
    // LLM Inference agent — deterministic on-chain AI decision
    uint256 public constant LLM_AGENT_ID = 2;         // ← UPDATE THIS

    // How much STT to reserve for agent gas costs (per invocation)
    // Check Gas Fees docs to size this correctly; 0.1 STT is a safe start
    uint256 public constant AGENT_GAS_RESERVE = 0.1 ether;

    // Your timesheet API base URL (replace with FlexStaff or mock endpoint)
    string public constant TIMESHEET_API = "https://api.flexstaff.co.uk/timesheets/";

    // ----------------------------------------------------------
    // DATA STRUCTURES
    // ----------------------------------------------------------

    enum ShiftStatus {
        Funded,       // employer deposited, waiting for worker
        Submitted,    // worker submitted hours, JSON agent pending
        LLMPending,   // JSON verified, LLM agent running
        Approved,     // LLM approved, worker can claim
        Rejected,     // LLM rejected, employer can reclaim
        Settled       // payment claimed/reclaimed
    }

    struct Shift {
        address employer;
        address worker;
        uint256 escrow;          // STT held for worker payment
        uint256 agreedHourlyRate; // in wei per hour
        uint256 agreedHours;
        uint256 submittedHours;  // what worker claims
        uint256 verifiedHours;   // what the API returns
        ShiftStatus status;
        string  externalShiftId; // your FlexStaff shiftId
        string  llmReasoning;    // stored for audit/demo purposes
    }

    // shiftId (on-chain) → Shift
    mapping(uint256 => Shift) public shifts;
    uint256 public nextShiftId;

    // Somnia Agent requestId → on-chain shiftId
    // We need this to route callbacks back to the right shift
    mapping(uint256 => uint256) public requestToShift;
    // Flag so we know which agent type the callback is for
    mapping(uint256 => bool)    public requestIsLLM;

    // ----------------------------------------------------------
    // EVENTS — emit these; the frontend listens to them
    // ----------------------------------------------------------

    event ShiftFunded(uint256 indexed shiftId, address employer, address worker, uint256 escrow);
    event HoursSubmitted(uint256 indexed shiftId, uint256 submittedHours, uint256 agentRequestId);
    event TimesheetVerified(uint256 indexed shiftId, uint256 verifiedHours, uint256 llmRequestId);
    event LLMDecision(uint256 indexed shiftId, bool approved, string reasoning);
    event PaymentReleased(uint256 indexed shiftId, address recipient, uint256 amount);

    // ----------------------------------------------------------
    // STEP 1: Employer deposits escrow and registers the shift
    // ----------------------------------------------------------

    function depositShift(
        address worker,
        uint256 agreedHours,
        uint256 agreedHourlyRate, // wei per hour
        string calldata externalShiftId
    ) external payable returns (uint256 shiftId) {
        require(msg.value > AGENT_GAS_RESERVE * 2, "Escrow too small to cover agent costs");
        require(agreedHours > 0 && agreedHours <= 24, "Invalid hours");

        shiftId = nextShiftId++;

        shifts[shiftId] = Shift({
            employer:         msg.sender,
            worker:           worker,
            escrow:           msg.value,
            agreedHourlyRate: agreedHourlyRate,
            agreedHours:      agreedHours,
            submittedHours:   0,
            verifiedHours:    0,
            status:           ShiftStatus.Funded,
            externalShiftId:  externalShiftId,
            llmReasoning:     ""
        });

        emit ShiftFunded(shiftId, msg.sender, worker, msg.value);
    }

    // ----------------------------------------------------------
    // STEP 2: Worker submits their hours → triggers JSON API Agent
    // ----------------------------------------------------------

    function submitHours(uint256 shiftId, uint256 hoursWorked) external payable {
        Shift storage shift = shifts[shiftId];
        require(msg.sender == shift.worker, "Not the assigned worker");
        require(shift.status == ShiftStatus.Funded, "Shift not in Funded state");
        require(hoursWorked > 0 && hoursWorked <= 24, "Invalid hours");

        shift.submittedHours = hoursWorked;
        shift.status = ShiftStatus.Submitted;

        // Build the JSON API agent payload
        // This asks the agent to fetch the timesheet record and extract
        // the "hoursWorked" field. The agent will call your API and
        // return the value, validated by consensus across Somnia nodes.
        //
        // Payload format for JSON API Request agent (check agents.somnia.network
        // for the exact selector and encoding for your agent version):
        string memory url = string(abi.encodePacked(
            TIMESHEET_API, shift.externalShiftId
        ));
        // JSONPath selector to extract the hours from the response
        string memory jsonPath = "$.hoursWorked";

        bytes memory payload = abi.encodeWithSignature(
            "request(string,string)",
            url,
            jsonPath
        );

        // Call the agent. We pay AGENT_GAS_RESERVE from the shift escrow
        // (employer already sent enough value in depositShift).
        // The remaining escrow stays in this contract for worker payment.
        uint256 agentRequestId = PLATFORM.createRequest{value: AGENT_GAS_RESERVE}(
            JSON_API_AGENT_ID,
            address(this),
            this.handleTimesheetResponse.selector,
            payload
        );

        // Map the Somnia request back to our shift so the callback can find it
        requestToShift[agentRequestId] = shiftId;

        emit HoursSubmitted(shiftId, hoursWorked, agentRequestId);
    }

    // ----------------------------------------------------------
    // STEP 3: JSON API Agent callback → triggers LLM Agent
    // ----------------------------------------------------------

    function handleTimesheetResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /* details */
    ) external {
        // SECURITY: Only the platform contract can call us back
        require(msg.sender == address(PLATFORM), "Only Somnia platform");

        uint256 shiftId = requestToShift[requestId];
        Shift storage shift = shifts[shiftId];
        require(shift.status == ShiftStatus.Submitted, "Unexpected callback state");

        if (status != ResponseStatus.Success || responses.length == 0) {
            // Agent failed (API unreachable, timeout, etc.) → refund employer
            _rejectShift(shiftId, "Timesheet API verification failed");
            return;
        }

        // Decode the result — the JSON API agent returns a uint256
        // (we told it the JSONPath, it extracted the number and ABI-encoded it)
        uint256 apiHours = abi.decode(responses[0].result, (uint256));
        shift.verifiedHours = apiHours;

        // Tolerance: allow ±0 hour discrepancy (you can make this flexible)
        bool hoursMatch = (apiHours == shift.submittedHours);

        if (!hoursMatch) {
            _rejectShift(shiftId, "Hours submitted don't match API record");
            return;
        }

        // Hours verified. Now hand off to the LLM agent for the final decision.
        // The LLM checks things the simple API check can't: overtime rules,
        // break deductions, dispute flags, etc.
        shift.status = ShiftStatus.LLMPending;

        // Build the LLM prompt. Keep it tight — deterministic models do better
        // with structured, unambiguous instructions.
        string memory prompt = string(abi.encodePacked(
            "You are an autonomous payroll auditor. "
            "Review this shift and decide if payment should be APPROVED or REJECTED. "
            "Shift ID: ", shift.externalShiftId, ". "
            "Agreed hours: ", _toString(shift.agreedHours), ". "
            "Verified hours from API: ", _toString(apiHours), ". "
            "Reply with exactly: APPROVED: <one sentence reason> "
            "or REJECTED: <one sentence reason>. No other text."
        ));

        bytes memory llmPayload = abi.encodeWithSignature(
            "infer(string)",
            prompt
        );

        uint256 llmRequestId = PLATFORM.createRequest{value: AGENT_GAS_RESERVE}(
            LLM_AGENT_ID,
            address(this),
            this.handleLLMDecision.selector,
            llmPayload
        );

        requestToShift[llmRequestId] = shiftId;
        requestIsLLM[llmRequestId] = true;

        emit TimesheetVerified(shiftId, apiHours, llmRequestId);
    }

    // ----------------------------------------------------------
    // STEP 4: LLM Agent callback → final decision
    // ----------------------------------------------------------

    function handleLLMDecision(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory /* details */
    ) external {
        require(msg.sender == address(PLATFORM), "Only Somnia platform");

        uint256 shiftId = requestToShift[requestId];
        Shift storage shift = shifts[shiftId];
        require(shift.status == ShiftStatus.LLMPending, "Unexpected callback state");

        if (status != ResponseStatus.Success || responses.length == 0) {
            _rejectShift(shiftId, "LLM agent failed to reach consensus");
            return;
        }

        // LLM returns a string. We check if it starts with "APPROVED".
        string memory decision = abi.decode(responses[0].result, (string));
        shift.llmReasoning = decision;

        bool approved = _startsWith(decision, "APPROVED");

        if (approved) {
            shift.status = ShiftStatus.Approved;
            emit LLMDecision(shiftId, true, decision);
        } else {
            _rejectShift(shiftId, decision);
        }
    }

    // ----------------------------------------------------------
    // STEP 5: Worker claims payment (after Approved)
    // ----------------------------------------------------------

    function claimPayment(uint256 shiftId) external {
        Shift storage shift = shifts[shiftId];
        require(msg.sender == shift.worker, "Not the worker");
        require(shift.status == ShiftStatus.Approved, "Payment not approved");

        shift.status = ShiftStatus.Settled;

        // Pay worker for the hours the API verified (not just what they claimed)
        uint256 payment = shift.verifiedHours * shift.agreedHourlyRate;
        // Return any leftover escrow to the employer
        uint256 leftover = shift.escrow > payment ? shift.escrow - payment : 0;

        if (payment > 0) {
            payable(shift.worker).transfer(payment);
            emit PaymentReleased(shiftId, shift.worker, payment);
        }
        if (leftover > 0) {
            payable(shift.employer).transfer(leftover);
        }
    }

    // Employer reclaims escrow after a rejection
    function reclaimEscrow(uint256 shiftId) external {
        Shift storage shift = shifts[shiftId];
        require(msg.sender == shift.employer, "Not the employer");
        require(shift.status == ShiftStatus.Rejected, "Not rejected");

        shift.status = ShiftStatus.Settled;
        uint256 amount = shift.escrow;
        shift.escrow = 0;
        payable(shift.employer).transfer(amount);
        emit PaymentReleased(shiftId, shift.employer, amount);
    }

    // ----------------------------------------------------------
    // INTERNAL HELPERS
    // ----------------------------------------------------------

    function _rejectShift(uint256 shiftId, string memory reason) internal {
        shifts[shiftId].status = ShiftStatus.Rejected;
        emit LLMDecision(shiftId, false, reason);
    }

    function _startsWith(string memory str, string memory prefix) internal pure returns (bool) {
        bytes memory strBytes = bytes(str);
        bytes memory prefixBytes = bytes(prefix);
        if (strBytes.length < prefixBytes.length) return false;
        for (uint i = 0; i < prefixBytes.length; i++) {
            if (strBytes[i] != prefixBytes[i]) return false;
        }
        return true;
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

    // Allow contract to receive STT (needed for agent rebates)
    receive() external payable {}
}
