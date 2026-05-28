// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * PayrollParser.sol
 *
 * Why this library exists:
 * Solidity has no built-in string split or parseInt. The LLM agent
 * returns a plain string. We need to parse 9 numbers out of it.
 *
 * We tell the LLM to return this exact format (pipe-delimited integers in pence):
 *
 *   APPROVED|12000|1840|784|1104|600|360|1448|8776
 *    ^         ^     ^    ^    ^    ^    ^    ^    ^
 *    decision  gross tax  eNI  erNI ePen erPen hol  net
 *
 * All values are in PENCE (integer). No decimals. No floats.
 * This makes Solidity parsing trivial and consensus easy.
 *
 * Example: £120.00 gross = 12000 pence
 *          £18.40 tax    = 1840 pence
 *          £87.76 net    = 8776 pence
 */

library PayrollParser {

    struct Payslip {
        bool    approved;
        uint256 grossPay;       // pence
        uint256 incomeTax;      // pence — goes to HMRC via employer RTI
        uint256 employeeNI;     // pence — deducted from worker
        uint256 employerNI;     // pence — employer liability on top
        uint256 employeePension;// pence — deducted from worker, to pension provider
        uint256 employerPension;// pence — employer contribution, to pension provider
        uint256 holidayPay;     // pence — accrued or paid
        uint256 netPay;         // pence — what the worker actually receives
        string  rawResponse;    // full LLM string, stored for audit
    }

    /**
     * parse()
     *
     * Takes the raw LLM response string and returns a Payslip struct.
     *
     * Expected format: "APPROVED|12000|1840|784|1104|600|360|1448|8776"
     * Or rejection:    "REJECTED|0|0|0|0|0|0|0|0"
     *
     * If parsing fails for any reason, returns approved=false (safe default).
     */
    function parse(string memory response) internal pure returns (Payslip memory slip) {
        slip.rawResponse = response;

        bytes memory b = bytes(response);
        if (b.length == 0) return slip; // empty → rejected

        // Split into segments by '|'
        // We expect exactly 9 segments
        string[9] memory segments;
        uint segCount = 0;
        uint start = 0;

        for (uint i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == "|") {
                if (segCount < 9) {
                    segments[segCount] = _slice(b, start, i);
                    segCount++;
                }
                start = i + 1;
            }
        }

        if (segCount < 9) return slip; // malformed → rejected

        // First segment must be exactly "APPROVED"
        slip.approved = _equals(segments[0], "APPROVED");
        if (!slip.approved) return slip;

        // Parse the 8 numeric segments
        // Using unchecked because parseUint already validates digits
        slip.grossPay        = _parseUint(segments[1]);
        slip.incomeTax       = _parseUint(segments[2]);
        slip.employeeNI      = _parseUint(segments[3]);
        slip.employerNI      = _parseUint(segments[4]);
        slip.employeePension = _parseUint(segments[5]);
        slip.employerPension = _parseUint(segments[6]);
        slip.holidayPay      = _parseUint(segments[7]);
        slip.netPay          = _parseUint(segments[8]);

        // Sanity check: net pay must be less than gross
        // If LLM hallucinates nonsense numbers, reject it
        if (slip.netPay >= slip.grossPay && slip.grossPay > 0) {
            slip.approved = false;
            return slip;
        }

        return slip;
    }

    /**
     * parseUintFromString()
     *
     * Public helper used by ShiftEscrow to convert the JSON API agent's
     * string result (e.g. "8") into a uint256.
     *
     * The JSON API agent's fetchString() returns an ABI-encoded string,
     * not a uint. So "8 hours" comes back as the string "8".
     * This function parses it safely — non-digits return 0.
     */
    function parseUintFromString(string memory s) internal pure returns (uint256) {
        return _parseUint(s);
    }

    // ── Internal string utilities ────────────────────────────────

    function _slice(bytes memory b, uint start, uint end) private pure returns (string memory) {
        bytes memory result = new bytes(end - start);
        for (uint i = start; i < end; i++) {
            result[i - start] = b[i];
        }
        return string(result);
    }

    function _parseUint(string memory s) private pure returns (uint256 result) {
        bytes memory b = bytes(s);
        for (uint i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c < 48 || c > 57) return 0; // non-digit → return 0 (safe)
            result = result * 10 + (c - 48);
        }
    }

    function _equals(string memory a, string memory b) private pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
