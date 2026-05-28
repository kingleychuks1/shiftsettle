# Somnia Agents — ShiftSettle Reference
*All values CONFIRMED from agents.somnia.network code generator*

---

## ✅ Platform Contract — CONFIRMED

| Network | Address | Chain ID |
|---|---|---|
| **Testnet** | `0x5E5205CF39E766118C01636bED000A54D93163E6` | 50312 |
| Mainnet | TBC — check docs | 5031 |

> ⚠️ Previous address `0x037Bb9...` was WRONG. This is the correct one.

---

## ✅ Agent IDs — CONFIRMED

| Agent | ID | Execution Cost/Runner | Total (×3 runners) |
|---|---|---|---|
| JSON API Request | `13174292974160097713` | 0.03 STT | ~0.09 STT |
| LLM Inference | `12847293847561029384` | 0.07 STT | ~0.21 STT |
| LLM Parse Website | `12875401142070969085` | TBC | TBC |

---

## ✅ Deposit Formula — CONFIRMED

```solidity
uint256 floor  = platform.getRequestDeposit(); // call this — it can change
uint256 reward = PER_AGENT_EXECUTION_COST * 3; // 3 = default subcommittee size
uint256 deposit = floor + reward;

PLATFORM.createRequest{value: deposit}(agentId, callbackAddr, selector, payload);
```

**Never hardcode the deposit.** Call `getRequestDeposit()` at invocation time.

---

## ✅ JSON API Agent — CONFIRMED

**Interface:**
```solidity
interface IJsonApiAgent {
    function fetchString(
        string memory url,
        string memory selector
    ) external returns (string memory);
}
```

**Payload encoding:**
```solidity
bytes memory payload = abi.encodeWithSelector(
    IJsonApiAgent.fetchString.selector,
    "https://api.flexstaff.co.uk/timesheets/SHIFT-001",
    "hoursWorked"   // JSON key name
);
```

**Return value:**
```solidity
// In callback — result is ABI-encoded string e.g. "8"
string memory hoursStr = abi.decode(responses[0].result, (string));
uint256 hours = PayrollParser.parseUintFromString(hoursStr);
```

> ⚠️ Returns a STRING not uint256. You must parse it in the callback.

**Other methods available (6 total — check code generator for others):**
- `fetchString` — confirmed above
- Likely: `fetchNumber`, `fetchInt`, etc. — check Solidity tab for each

---

## ✅ LLM Inference Agent — CONFIRMED

**Interface:**
```solidity
interface ILLMAgent {
    function inferString(
        string memory prompt,
        string memory system,
        bool chainOfThought,
        string[] memory allowedValues
    ) external returns (string memory);
}
```

**Payload encoding:**
```solidity
// Free-form output (payroll calculation):
string[] memory noConstraint = new string[](0);
bytes memory payload = abi.encodeWithSelector(
    ILLMAgent.inferString.selector,
    prompt,
    "You are a UK PAYE payroll calculator.",
    false,         // chainOfThought: false = faster, more deterministic
    noConstraint
);

// Constrained output (APPROVED or REJECTED only):
string[] memory allowed = new string[](2);
allowed[0] = "APPROVED";
allowed[1] = "REJECTED";
bytes memory payload = abi.encodeWithSelector(
    ILLMAgent.inferString.selector,
    prompt,
    system,
    false,
    allowed        // network ENFORCES this — cannot hallucinate other values
);
```

**Return value:**
```solidity
// In callback — result is ABI-encoded string
string memory result = abi.decode(responses[0].result, (string));
```

**Parameters explained:**
- `prompt` — the user message / question
- `system` — sets the model's role/persona. Keep short (every token = gas)
- `chainOfThought` — `true` enables visible reasoning steps (slower). Use `false` for production
- `allowedValues` — if non-empty, output is hard-constrained. Pass `[]` for free-form

**Other methods (4 total):**
- `inferString` — confirmed above
- `inferNumber(string prompt, string system, bool cot, uint256 min, uint256 max)` — likely
- `inferChat(...)` — conversation thread
- `inferToolsChat(...)` — tool calling responses

---

## ✅ createRequest Signature — CONFIRMED

```solidity
interface IAgentRequester {
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4  callbackSelector,
        bytes   calldata payload
    ) external payable returns (uint256 requestId);

    function getRequestDeposit() external view returns (uint256);
}
```

---

## ✅ Callback Signature — CONFIRMED

```solidity
function handleResponse(
    uint256 requestId,
    Response[] memory responses,
    ResponseStatus status,
    Request memory /* details */
) external {
    require(msg.sender == address(platform), "Only platform can call");

    if (status == ResponseStatus.Success && responses.length > 0) {
        // For string: abi.decode(responses[0].result, (string))
        // For uint:   abi.decode(responses[0].result, (uint256))
    }
}
```

---

## ✅ Receipts API

```
GET https://receipts.net.somnia.omnia.host?requestId={id}&contract={platformAddress}
```

Shows full execution log: HTTP request, HTML→markdown, LLM prompt/output,
token count, confidence, validator addresses.

```typescript
const PLATFORM = "0x5E5205CF39E766118C01636bED000A54D93163E6";
const receipt = await fetch(
    `https://receipts.net.somnia.omnia.host?requestId=${requestId}&contract=${PLATFORM}`
).then(r => r.json());
```

---

## ✅ Test Net Info

- **RPC:** `https://dream-rpc.somnia.network`
- **Chain ID:** `50312`
- **Explorer:** `https://explorer.somnia.network`
- **Faucet:** `https://testnet.somnia.network`
- **STT:** Ask Emre/Anjali on Telegram for extra tokens if faucet is slow

---

## 📅 Remaining Schedule

| Date | Event |
|---|---|
| **29 May, 5 PM BST** | "How to Win a Hackathon" — Anthony, CEO Encode |
| **7 June** | Final submission deadline |
| **11 June, 5 PM BST** | Finale — Paul Thomas, Founder Somnia |

**Telegram:** https://t.me/+XHq0F0JXMyhmMzM0

---

## 🔲 Remaining TODOs

- [ ] Verify `fetchString` selector format for `hoursWorked` field
      (does your mock API return `{"hoursWorked": 8}` or `{"hours_worked": 8}`?)
- [ ] Deploy mock timesheet API on Vercel at `https://api.flexstaff.co.uk/timesheets/[id]`
      returning `{ "hoursWorked": 8 }`
- [ ] Run `npx hardhat compile` — check no errors
- [ ] Run `npx hardhat run scripts/deploy.ts --network somniaTestnet`
- [ ] Paste deployed address into `frontend/lib/config.ts`
- [ ] Do full end-to-end test on testnet
- [ ] Wire receipts API into Agent Pipeline panel in the UI
- [ ] Record 2–5 min demo video
- [ ] Push to public GitHub repo
