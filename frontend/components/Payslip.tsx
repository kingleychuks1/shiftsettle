"use client";
/**
 * Payslip.tsx
 *
 * Renders a UK-style payslip from on-chain data.
 * This is a key demo asset — it shows judges that the LLM
 * calculated real statutory deductions, not fake numbers.
 *
 * Design mirrors a real payslip layout:
 *   - Earnings on the left
 *   - Deductions on the right
 *   - Net pay at the bottom
 *   - HMRC liabilities noted below
 */

import { PayslipData } from "../lib/useShiftEscrow";

interface Props {
  shiftId: number;
  externalShiftId: string;
  workerAddress: string;
  agreedHours: number;
  weekNumber: number;
  payslip: PayslipData;
}

export default function Payslip({
  shiftId,
  externalShiftId,
  workerAddress,
  agreedHours,
  weekNumber,
  payslip,
}: Props) {
  return (
    <div className="bg-white text-gray-900 rounded-xl border border-gray-200 overflow-hidden text-xs font-mono">
      {/* Header */}
      <div className="bg-gray-900 text-white px-5 py-3 flex items-center justify-between">
        <div>
          <p className="font-bold text-sm">ShiftSettle Payslip</p>
          <p className="text-gray-400 text-xs mt-0.5">On-chain · Somnia Agentic L1</p>
        </div>
        <div className="text-right">
          <p className="text-gray-300">Shift #{shiftId}</p>
          <p className="text-gray-400">{externalShiftId}</p>
        </div>
      </div>

      {/* Worker / period info */}
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 grid grid-cols-2 gap-x-6 gap-y-1">
        <Row label="Worker" value={`${workerAddress.slice(0,6)}...${workerAddress.slice(-4)}`} />
        <Row label="Tax Week" value={`Week ${weekNumber}`} />
        <Row label="Hours Paid" value={`${agreedHours} hours`} />
        <Row label="Tax Year" value="2025/26" />
      </div>

      {/* Earnings + Deductions split */}
      <div className="grid grid-cols-2 divide-x divide-gray-200">
        {/* Earnings */}
        <div className="px-5 py-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Earnings</p>
          <div className="space-y-2">
            <Row label="Basic Pay" value={payslip.grossPay} />
            <Row label="Holiday Pay (12.07%)" value={payslip.holidayPay} accent="text-green-600" />
            <div className="border-t border-gray-200 pt-2 mt-2">
              <Row label="Gross Earnings" value={`£${((payslip.grossPayPence + payslip.holidayPayPence) / 100).toFixed(2)}`} bold />
            </div>
          </div>
        </div>

        {/* Deductions */}
        <div className="px-5 py-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Deductions</p>
          <div className="space-y-2">
            <Row label="Income Tax (PAYE)" value={payslip.incomeTax} accent="text-red-600" />
            <Row label="Employee NI" value={payslip.employeeNI} accent="text-red-600" />
            <Row label="Employee Pension" value={payslip.employeePension} accent="text-red-600" />
            <div className="border-t border-gray-200 pt-2 mt-2">
              <Row label="Total Deductions" value={payslip.totalDeductions} bold accent="text-red-700" />
            </div>
          </div>
        </div>
      </div>

      {/* Net pay */}
      <div className="px-5 py-4 bg-green-50 border-t-2 border-green-200 flex items-center justify-between">
        <p className="font-bold text-sm text-green-900">NET PAY (worker receives)</p>
        <p className="font-bold text-lg text-green-700">{payslip.netPay}</p>
      </div>

      {/* Employer costs — shown separately, these don't come from worker */}
      <div className="px-5 py-4 bg-yellow-50 border-t border-yellow-200">
        <p className="text-xs font-bold text-yellow-700 uppercase tracking-wider mb-3">
          Employer Costs (on top of worker pay)
        </p>
        <div className="space-y-1.5">
          <Row label="Employer NI (13.8%)" value={payslip.employerNI} accent="text-yellow-700" />
          <Row label="Employer Pension (3%)" value={payslip.employerPension} accent="text-yellow-700" />
          <div className="border-t border-yellow-300 pt-2 mt-2">
            <Row label="Total Cost to Employer" value={payslip.totalCostToEmployer} bold accent="text-yellow-800" />
          </div>
        </div>
      </div>

      {/* HMRC liabilities note */}
      <div className="px-5 py-3 bg-blue-50 border-t border-blue-200">
        <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1">HMRC Remittance Required</p>
        <p className="text-xs text-blue-600">
          Income Tax ({payslip.incomeTax}) + Employer NI ({payslip.employerNI}) must be remitted via RTI.
          Pension contributions ({payslip.employeePension} + {payslip.employerPension}) to pension provider.
          All amounts recorded on-chain as employer liabilities.
        </p>
      </div>

      {/* LLM audit trail */}
      <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
          On-Chain LLM Receipt (Somnia Agent)
        </p>
        <p className="text-xs text-gray-400 break-all leading-relaxed">{payslip.llmRawResponse}</p>
      </div>
    </div>
  );
}

// ── Small helper component ────────────────────────────────────

function Row({
  label,
  value,
  bold = false,
  accent = "text-gray-800",
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: string;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`text-gray-500 ${bold ? "font-semibold text-gray-700" : ""}`}>{label}</span>
      <span className={`${accent} ${bold ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}
