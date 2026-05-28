// frontend/lib/config.ts
// ─────────────────────────────────────────────────────────────
// Single source of truth for all addresses & network config.
// Update CONTRACT_ADDRESS after running the deploy script.
// ─────────────────────────────────────────────────────────────

export const SOMNIA_TESTNET = {
  id: 50312,
  name: "Somnia Testnet",
  rpcUrl: "https://dream-rpc.somnia.network",
  explorerUrl: "https://explorer.somnia.network",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
} as const;

// ← Paste the address from `npx hardhat run scripts/deploy.ts` here
export const CONTRACT_ADDRESS = "0xYOUR_DEPLOYED_CONTRACT_ADDRESS_HERE";

// ─────────────────────────────────────────────────────────────
// Contract ABI — only include the functions the frontend calls.
// (Get the full ABI from artifacts/contracts/ShiftEscrow.sol/
//  ShiftEscrow.json after running `npx hardhat compile`)
// ─────────────────────────────────────────────────────────────
export const SHIFT_ESCROW_ABI = [
  // Read
  "function shifts(uint256) view returns (address employer, address worker, uint256 escrow, uint256 agreedHourlyRate, uint256 agreedHours, uint256 submittedHours, uint256 verifiedHours, uint8 status, string externalShiftId, string llmReasoning)",
  "function nextShiftId() view returns (uint256)",

  // Write — employer
  "function depositShift(address worker, uint256 agreedHours, uint256 agreedHourlyRate, string externalShiftId) payable returns (uint256 shiftId)",

  // Write — worker
  "function submitHours(uint256 shiftId, uint256 hoursWorked) payable",
  "function claimPayment(uint256 shiftId)",

  // Write — employer
  "function reclaimEscrow(uint256 shiftId)",

  // Events — the frontend listens to these to update UI in real time
  "event ShiftFunded(uint256 indexed shiftId, address employer, address worker, uint256 escrow)",
  "event HoursSubmitted(uint256 indexed shiftId, uint256 submittedHours, uint256 agentRequestId)",
  "event TimesheetVerified(uint256 indexed shiftId, uint256 verifiedHours, uint256 llmRequestId)",
  "event LLMDecision(uint256 indexed shiftId, bool approved, string reasoning)",
  "event PaymentReleased(uint256 indexed shiftId, address recipient, uint256 amount)",
] as const;

// Status labels matching the Solidity enum (same index order)
export const SHIFT_STATUS = [
  "Funded",     // 0
  "Submitted",  // 1 - JSON API agent running
  "LLMPending", // 2 - LLM agent running
  "Approved",   // 3 - worker can claim
  "Rejected",   // 4 - employer can reclaim
  "Settled",    // 5 - done
] as const;

export type ShiftStatusKey = typeof SHIFT_STATUS[number];
