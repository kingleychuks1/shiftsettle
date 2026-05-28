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
