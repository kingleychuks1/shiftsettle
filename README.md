# ShiftSettle 🤖
### Autonomous Workforce Verification & Payment on Somnia Agentic L1
*Built for the Encode Club × Somnia Agentathon, May–June 2026*

---

## What it does

ShiftSettle removes every human from the shift-payment loop.

An employer deposits STT as escrow. A worker submits their hours.
**Two Somnia Agents then run autonomously**, with no human involvement:

1. **JSON API Agent** — queries an external timesheet API and returns the
   verified hours on-chain, validated by consensus across Somnia validator nodes.
2. **LLM Inference Agent** — a deterministic on-chain AI model reviews the
   shift data and issues an APPROVED/REJECTED decision with a written reason.

If approved, the worker claims their STT payment. Done.
If rejected, the employer's escrow is returned. Done.
No platform, no admin, no middleman.

---

## Why Somnia?

Traditional smart contracts can't fetch external data or run AI.
You'd normally need Chainlink + a separate AI API + a centralised relayer.
That's three points of failure and significant trust assumptions.

Somnia collapses all of this into native agent primitives with:
- **Decentralised execution** — multiple nodes run the agent; majority consensus required
- **Auditable receipts** — every agent step is signed and inspectable on-chain
- **Deterministic LLMs** — fixed seeds mean every node gets the same AI output → consensus possible
- **EVM-native ABI** — viem/Ethers.js work as-is; no new tooling to learn

---

## Architecture

```
Employer
  │
  ├─ depositShift() ─────────────────────────► ShiftEscrow.sol (Somnia)
                                                      │
Worker                                                │
  │                                                   │
  ├─ submitHours() ──────────────────────────────────►│
                                                      │
                                          createRequest(JSON_API_AGENT)
                                                      │
                                    ┌─────────────────▼──────────────────┐
                                    │   Somnia Decentralised Network      │
                                    │   Node 1, Node 2, Node 3 …         │
                                    │   → each queries FlexStaff API      │
                                    │   → majority consensus on hours     │
                                    └─────────────────┬──────────────────┘
                                                      │
                                          handleTimesheetResponse()
                                                      │
                                          createRequest(LLM_AGENT)
                                                      │
                                    ┌─────────────────▼──────────────────┐
                                    │   Somnia LLM Agent (on-chain AI)   │
                                    │   Deterministic inference           │
                                    │   "APPROVED: hours match record"   │
                                    └─────────────────┬──────────────────┘
                                                      │
                                          handleLLMDecision()
                                                      │
                              ┌───────────────────────┤
                              │                       │
                         APPROVED               REJECTED
                              │                       │
                    Worker claimPayment()    Employer reclaimEscrow()
```

---

## Project Structure

```
shiftsettle/
├── contracts/
│   └── ShiftEscrow.sol       ← The core contract. Read this first.
├── scripts/
│   └── deploy.ts             ← Deploy to Somnia Testnet
├── hardhat.config.ts         ← Network config (testnet + mainnet)
└── frontend/
    ├── app/
    │   └── page.tsx          ← Dashboard UI (Next.js App Router)
    └── lib/
        ├── config.ts         ← Addresses, ABI, network config
        └── useShiftEscrow.ts ← All contract interaction logic (viem)
```

---

## Getting Started

### 1. Install dependencies

```bash
# Contract tooling
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox dotenv ts-node
npm install --save-dev @types/node typescript

# Frontend
cd frontend
npm install next react react-dom viem
npm install --save-dev @types/react @types/node typescript tailwindcss
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env`:
```
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
```

**Never commit your private key. The .env is in .gitignore.**

### 3. Get testnet STT

Visit https://testnet.somnia.network/ and use the faucet.
You need STT to pay for:
- Contract deployment gas
- Agent invocation deposits (each agent call requires ~0.1 STT)

### 4. Find your agent IDs

Visit **https://agents.somnia.network**
- Select "JSON API Request" → note the agent ID
- Select "LLM Inference" → note the agent ID
- Update `JSON_API_AGENT_ID` and `LLM_AGENT_ID` in `ShiftEscrow.sol`

Also look at the "TypeScript" tab for each agent — it shows you the exact
payload encoding. You may need to update the `abi.encodeWithSignature` calls
in the contract to match what the code generator outputs.

### 5. Deploy the contract

```bash
npx hardhat compile
npx hardhat run scripts/deploy.ts --network somniaTestnet
```

Copy the deployed address into `frontend/lib/config.ts` → `CONTRACT_ADDRESS`.

### 6. Set up a mock timesheet API

For the demo/hackathon, your timesheet API can be a simple Next.js API route
or Vercel serverless function that returns JSON like:

```json
{ "hoursWorked": 8, "shiftId": "SHIFT-001", "clockIn": "09:00", "clockOut": "17:00" }
```

Update `TIMESHEET_API` in `ShiftEscrow.sol` to point to your endpoint.
The Somnia JSON API agent will fetch this URL and extract `$.hoursWorked`.

### 7. Run the frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:3000

---

## Submitting to the Hackathon

Required deliverables (from the brief):
- [x] Working prototype deployed on Somnia Testnet (or Mainnet)
- [ ] Public GitHub repo — make this public before submission
- [ ] 2–5 min demo video — record the agent pipeline panel updating live
- [ ] Presentation deck — use the architecture diagram above

**For the video:** The most compelling moment is watching the Agent Pipeline
panel in the UI update from "JSON API Agent running..." → "LLM Agent running..."
→ "Approved" with the LLM's written reasoning appearing on screen.
No human interaction. That's the story.

---

## Judging Criteria Checklist

| Criterion | How ShiftSettle addresses it |
|-----------|------------------------------|
| **Functionality** | Deployed, e2e tested, no critical failures |
| **Agent-First Design** | Uses JSON API + LLM agents natively; contract is literally a Somnia agent consumer |
| **Innovation** | Composing two agent types in one flow; real-world labour market use case |
| **Autonomous Performance** | Zero humans in the loop after worker submits hours |

---

## Known Limitations / TODO

- [ ] Look up exact agent IDs at agents.somnia.network (placeholders in code)
- [ ] Verify exact payload encoding for each agent with the code generator
- [ ] Add event listener instead of polling (WebSocket to Somnia RPC)
- [ ] Add wallet connect UI (currently requires MetaMask injected)
- [ ] Dispute flow: let employer challenge before LLM runs
- [ ] Move to Mainnet for final submission

---

## Resources

- Somnia Docs: https://docs.somnia.network/agents
- Agent Code Generator: https://agents.somnia.network
- Somnia Testnet Explorer: https://explorer.somnia.network
- Somnia Faucet: https://testnet.somnia.network
- Hackathon Telegram: https://t.me/+XHq0F0JXMyhmMzM0
- Workshop "How to build on Somnia": Fri 22 May, 5 PM BST

---

## UK Payroll — How It Works

### The Problem ShiftSettle Solves

A temp worker earning £15/hr doesn't receive £15/hr.
Before a penny reaches them, UK law requires:

| Deduction | Who pays | Rate |
|-----------|----------|------|
| Income Tax (PAYE) | Worker | Based on tax code (e.g. 20% basic rate) |
| Employee National Insurance | Worker | 8% between £242–£967/wk |
| Employee Pension | Worker | 5% on qualifying earnings (auto-enrolment) |
| Holiday Pay | Employer accrual | 12.07% of gross (5.6 weeks/yr) |
| Employer NI | Employer ON TOP | 13.8% above £175/wk |
| Employer Pension | Employer ON TOP | 3% on qualifying earnings |

A worker earning £120 for an 8-hour shift at £15/hr ends up with ~£87 net.
The employer's true cost is ~£140. ShiftSettle calculates all of this autonomously.

### The LLM Payroll Agent Prompt

The contract sends the LLM a structured prompt with:
- Worker's tax code (1257L, BR, 0T, etc.)
- NI category (A, B, C, H, M)
- Year-to-date gross and tax paid (for cumulative tax calculation)
- Pension opt-in status
- Gross pay for the shift and the week number

The LLM returns a **pipe-delimited string of integers in pence**:

```
APPROVED|12000|1840|784|1104|600|360|1448|8776
```

`PayrollParser.sol` splits this string in Solidity and decodes each field.
No JSON, no floats — just integers the EVM can handle reliably.

### On-Chain HMRC Audit Trail

Every settled shift stores:
- Full payslip breakdown (all 8 deduction lines)
- Cumulative employer liabilities (tax to HMRC, employer NI, pension)
- Worker YTD figures updated for the next calculation
- The raw LLM response for full auditability

This is RTI-ready data. The employer can export it for their FPS submission.

### Worker Profile

Workers register once with their:
- Tax code (from P45 or HMRC starter checklist)
- NI category (from P46/starter declaration)
- YTD gross and tax paid (from P45 if transferring mid-year)
- Pension opt-in

This data is stored on-chain and updated automatically after each settled shift.
