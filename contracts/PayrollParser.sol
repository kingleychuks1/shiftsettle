// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * PayrollParser.sol
 *
 * Parses the pipe-delimited string returned by inferString().
 *
 * Expected format (all values in INTEGER PENCE, no decimals):
 *   APPROVED|12000|1840|784|1104|600|360|1448|8776
 *   ^         ^     ^    ^    ^    ^    ^    ^    ^
 *   decision  gross tax  eNI  erNI ePen erPen hol  net
 *
 * Why pence integers: Solidity has no floats. Consensus across
 * validators requires byte-identical output. Integer pence
 * makes both possible.
 */
library PayrollParser {

    struct Payslip {
        bool    approved;
        uint256 grossPay;
        uint256 incomeTax;
        uint256 employeeNI;
        uint256 employerNI;
        uint256 employeePension;
        uint256 employerPension;
        uint256 holidayPay;
        uint256 netPay;
    }

    function parse(string memory raw) internal pure returns (Payslip memory slip) {
        bytes memory b = bytes(raw);
        if (b.length == 0) return slip;

        string[9] memory seg;
        uint n;
        uint start;

        for (uint i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == "|") {
                if (n < 9) { seg[n] = _slice(b, start, i); n++; }
                start = i + 1;
            }
        }
        if (n < 9) return slip;

        if (keccak256(bytes(seg[0])) != keccak256(bytes("APPROVED"))) return slip;
        slip.approved       = true;
        slip.grossPay       = _toUint(seg[1]);
        slip.incomeTax      = _toUint(seg[2]);
        slip.employeeNI     = _toUint(seg[3]);
        slip.employerNI     = _toUint(seg[4]);
        slip.employeePension = _toUint(seg[5]);
        slip.employerPension = _toUint(seg[6]);
        slip.holidayPay     = _toUint(seg[7]);
        slip.netPay         = _toUint(seg[8]);

        // Sanity: net must be less than gross
        if (slip.netPay >= slip.grossPay && slip.grossPay > 0) {
            slip.approved = false;
        }
    }

    function _slice(bytes memory b, uint s, uint e) private pure returns (string memory) {
        bytes memory r = new bytes(e - s);
        for (uint i = s; i < e; i++) r[i - s] = b[i];
        return string(r);
    }

    function _toUint(string memory s) internal pure returns (uint256 r) {
        bytes memory b = bytes(s);
        for (uint i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c < 48 || c > 57) return r;
            r = r * 10 + (c - 48);
        }
    }
}
