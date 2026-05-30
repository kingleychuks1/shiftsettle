// frontend/lib/config.ts

export const SOMNIA_TESTNET = {
  id: 50312,
  name: "Somnia Testnet",
  rpcUrl: "https://dream-rpc.somnia.network",
  explorerUrl: "https://explorer.somnia.network",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
} as const;

export const CONTRACT_ADDRESS = "0xe41679fb994bedd880795e81cc2b9d39831548d0";

export const SHIFT_ESCROW_ABI = [
  { "inputs": [{ "internalType": "uint256", "name": "shiftId", "type": "uint256" }], "name": "claimPayment", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "worker", "type": "address" }, { "internalType": "uint256", "name": "agreedHours", "type": "uint256" }, { "internalType": "uint256", "name": "agreedHourlyRatePence", "type": "uint256" }, { "internalType": "string", "name": "externalShiftId", "type": "string" }, { "internalType": "uint256", "name": "weekNumber", "type": "uint256" }], "name": "depositShift", "outputs": [{ "internalType": "uint256", "name": "shiftId", "type": "uint256" }], "stateMutability": "payable", "type": "function" },
  { "inputs": [{ "internalType": "uint256", "name": "shiftId", "type": "uint256" }], "name": "reclaimEscrow", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "internalType": "string", "name": "taxCode", "type": "string" }, { "internalType": "string", "name": "niCategory", "type": "string" }, { "internalType": "uint256", "name": "ytdGrossPence", "type": "uint256" }, { "internalType": "uint256", "name": "ytdTaxPaidPence", "type": "uint256" }, { "internalType": "bool", "name": "pensionOptedIn", "type": "bool" }], "name": "registerWorker", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [{ "internalType": "uint256", "name": "shiftId", "type": "uint256" }, { "internalType": "uint256", "name": "hoursWorked", "type": "uint256" }], "name": "submitHours", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "nextShiftId", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "workerProfiles", "outputs": [{ "internalType": "string", "name": "taxCode", "type": "string" }, { "internalType": "string", "name": "niCategory", "type": "string" }, { "internalType": "uint256", "name": "ytdGrossPence", "type": "uint256" }, { "internalType": "uint256", "name": "ytdTaxPaidPence", "type": "uint256" }, { "internalType": "bool", "name": "pensionOptedIn", "type": "bool" }, { "internalType": "bool", "name": "registered", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "name": "shifts", "outputs": [{ "internalType": "address", "name": "employer", "type": "address" }, { "internalType": "address", "name": "worker", "type": "address" }, { "internalType": "uint256", "name": "escrow", "type": "uint256" }, { "internalType": "uint256", "name": "agreedHourlyRatePence", "type": "uint256" }, { "internalType": "uint256", "name": "agreedHours", "type": "uint256" }, { "internalType": "uint256", "name": "submittedHours", "type": "uint256" }, { "internalType": "uint256", "name": "verifiedHours", "type": "uint256" }, { "internalType": "uint8", "name": "status", "type": "uint8" }, { "internalType": "string", "name": "externalShiftId", "type": "string" }, { "internalType": "uint256", "name": "weekNumber", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "name": "payslips", "outputs": [{ "internalType": "uint256", "name": "grossPayPence", "type": "uint256" }, { "internalType": "uint256", "name": "incomeTaxPence", "type": "uint256" }, { "internalType": "uint256", "name": "employeeNIPence", "type": "uint256" }, { "internalType": "uint256", "name": "employerNIPence", "type": "uint256" }, { "internalType": "uint256", "name": "employeePensionPence", "type": "uint256" }, { "internalType": "uint256", "name": "employerPensionPence", "type": "uint256" }, { "internalType": "uint256", "name": "holidayPayPence", "type": "uint256" }, { "internalType": "uint256", "name": "netPayPence", "type": "uint256" }, { "internalType": "string", "name": "llmRawResponse", "type": "string" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "", "type": "address" }], "name": "employerLiabilities", "outputs": [{ "internalType": "uint256", "name": "taxToHMRC", "type": "uint256" }, { "internalType": "uint256", "name": "employerNIToHMRC", "type": "uint256" }, { "internalType": "uint256", "name": "pensionToProvider", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "worker", "type": "address" }, { "indexed": false, "internalType": "string", "name": "taxCode", "type": "string" }, { "indexed": false, "internalType": "string", "name": "niCategory", "type": "string" }], "name": "WorkerRegistered", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "shiftId", "type": "uint256" }, { "indexed": false, "internalType": "address", "name": "employer", "type": "address" }, { "indexed": false, "internalType": "address", "name": "worker", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "escrow", "type": "uint256" }], "name": "ShiftFunded", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "shiftId", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "hoursWorked", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "requestId", "type": "uint256" }], "name": "HoursSubmitted", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "shiftId", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "verifiedHours", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "llmRequestId", "type": "uint256" }], "name": "TimesheetVerified", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "shiftId", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "grossPay", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "incomeTax", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "employeeNI", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "employerNI", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "employeePension", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "employerPension", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "holidayPay", "type": "uint256" }, { "indexed": false, "internalType": "uint256", "name": "netPay", "type": "uint256" }], "name": "PayslipCalculated", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "shiftId", "type": "uint256" }, { "indexed": false, "internalType": "address", "name": "recipient", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amountPence", "type": "uint256" }], "name": "PaymentReleased", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "uint256", "name": "shiftId", "type": "uint256" }, { "indexed": false, "internalType": "string", "name": "reason", "type": "string" }], "name": "ShiftRejected", "type": "event" }
] as const;

export const SHIFT_STATUS = [
  "Funded", "Submitted", "LLMPending", "Approved", "Rejected", "Settled",
] as const;

export type ShiftStatusKey = typeof SHIFT_STATUS[number];

export const NI_CATEGORIES = [
  { value: "A", label: "A — Standard (most employees)" },
  { value: "B", label: "B — Married women / widows (reduced rate)" },
  { value: "C", label: "C — Over state pension age" },
  { value: "H", label: "H — Apprentice under 25" },
  { value: "M", label: "M — Under 21" },
  { value: "Z", label: "Z — Under 21, deferment" },
] as const;

export const COMMON_TAX_CODES = [
  { value: "1257L", label: "1257L — Standard personal allowance" },
  { value: "BR", label: "BR — Basic rate on all income (second job)" },
  { value: "0T", label: "0T — No personal allowance" },
  { value: "D0", label: "D0 — Higher rate on all income" },
  { value: "NT", label: "NT — No tax" },
] as const;

export function getCurrentWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

export function penceToPounds(pence: number | bigint): string {
  const p = typeof pence === "bigint" ? Number(pence) : pence;
  return `£${(p / 100).toFixed(2)}`;
}