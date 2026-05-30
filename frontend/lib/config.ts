// frontend/lib/config.ts

export const SOMNIA_TESTNET = {
  id: 50312,
  name: "Somnia Testnet",
  rpcUrl: "https://dream-rpc.somnia.network",
  explorerUrl: "https://explorer.somnia.network",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
} as const;

export const CONTRACT_ADDRESS = "0x5fac4cc26a15e0024e2bdcb34bd8d0dd4751712c";

export const SHIFT_ESCROW_ABI = [
  // Worker registration
  "function registerWorker(string taxCode, string niCategory, uint256 ytdGrossPence, uint256 ytdTaxPaidPence, bool pensionOptedIn)",
  "function workerProfiles(address) view returns (string taxCode, string niCategory, uint256 ytdGrossPence, uint256 ytdTaxPaidPence, bool pensionOptedIn, bool registered)",

  // Shift lifecycle
  "function depositShift(address worker, uint256 agreedHours, uint256 agreedHourlyRatePence, string externalShiftId, uint256 weekNumber) payable returns (uint256 shiftId)",
  "function submitHours(uint256 shiftId, uint256 hoursWorked)",
  "function claimPayment(uint256 shiftId)",
  "function reclaimEscrow(uint256 shiftId)",

  // Read
  "function shifts(uint256) view returns (address employer, address worker, uint256 escrow, uint256 agreedHourlyRatePence, uint256 agreedHours, uint256 submittedHours, uint256 verifiedHours, uint8 status, string externalShiftId, uint256 weekNumber)",
  "function payslips(uint256) view returns (uint256 grossPayPence, uint256 incomeTaxPence, uint256 employeeNIPence, uint256 employerNIPence, uint256 employeePensionPence, uint256 employerPensionPence, uint256 holidayPayPence, uint256 netPayPence, string llmRawResponse)",
  "function employerLiabilities(address) view returns (uint256 taxToHMRC, uint256 employerNIToHMRC, uint256 pensionToProvider)",
  "function nextShiftId() view returns (uint256)",

  // Events
  "event WorkerRegistered(address indexed worker, string taxCode, string niCategory)",
  "event ShiftFunded(uint256 indexed shiftId, address employer, address worker, uint256 escrow)",
  "event HoursSubmitted(uint256 indexed shiftId, uint256 hours, uint256 agentRequestId)",
  "event TimesheetVerified(uint256 indexed shiftId, uint256 verifiedHours, uint256 llmRequestId)",
  "event PayslipCalculated(uint256 indexed shiftId, uint256 grossPay, uint256 incomeTax, uint256 employeeNI, uint256 employerNI, uint256 employeePension, uint256 employerPension, uint256 holidayPay, uint256 netPay)",
  "event PaymentReleased(uint256 indexed shiftId, address recipient, uint256 amountPence)",
  "event ShiftRejected(uint256 indexed shiftId, string reason)",
] as const;

export const SHIFT_STATUS = [
  "Funded", "Submitted", "LLMPending", "Approved", "Rejected", "Settled",
] as const;

export type ShiftStatusKey = typeof SHIFT_STATUS[number];

// NI categories with descriptions for the UI
export const NI_CATEGORIES = [
  { value: "A", label: "A — Standard (most employees)" },
  { value: "B", label: "B — Married women / widows (reduced rate)" },
  { value: "C", label: "C — Over state pension age" },
  { value: "H", label: "H — Apprentice under 25" },
  { value: "M", label: "M — Under 21" },
  { value: "Z", label: "Z — Under 21, deferment" },
] as const;

// Common tax codes
export const COMMON_TAX_CODES = [
  { value: "1257L", label: "1257L — Standard personal allowance" },
  { value: "BR", label: "BR — Basic rate on all income (second job)" },
  { value: "0T", label: "0T — No personal allowance" },
  { value: "D0", label: "D0 — Higher rate on all income" },
  { value: "NT", label: "NT — No tax" },
] as const;

// Current ISO week number (for weekNumber param)
export function getCurrentWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

// Format pence to £ string
export function penceToPounds(pence: number | bigint): string {
  const p = typeof pence === "bigint" ? Number(pence) : pence;
  return `£${(p / 100).toFixed(2)}`;
}
