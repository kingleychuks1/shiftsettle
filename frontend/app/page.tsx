"use client";
/**
 * frontend/app/page.tsx — ShiftSettle Dashboard
 *
 * This is the demo UI. For the hackathon video, you'll walk through:
 *   1. Employer posts a shift (deposits escrow)
 *   2. Worker submits hours
 *   3. Watch the agent trace panel update in real time:
 *      [JSON API agent] → [LLM agent] → [Approved/Rejected]
 *   4. Worker claims payment in one click
 *
 * The real magic for judges is the AGENT TRACE panel — it shows
 * the Somnia network doing decentralized compute autonomously.
 * Make sure that panel is front and centre in your demo video.
 */

import { useState, useEffect, useCallback } from "react";
import { useShiftEscrow, ShiftData } from "../lib/useShiftEscrow";
import { SOMNIA_TESTNET } from "../lib/config";

// ── Status badge colours ────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  Funded:     "bg-blue-100 text-blue-800",
  Submitted:  "bg-yellow-100 text-yellow-800",
  LLMPending: "bg-purple-100 text-purple-800",
  Approved:   "bg-green-100 text-green-800",
  Rejected:   "bg-red-100 text-red-800",
  Settled:    "bg-gray-100 text-gray-600",
};

// ── Agent trace step (for the live pipeline panel) ──────────
interface TraceStep {
  id: string;
  label: string;
  status: "waiting" | "running" | "done" | "failed";
  detail?: string;
}

function agentTrace(shift: ShiftData | null): TraceStep[] {
  if (!shift) return [];
  const s = shift.status;
  return [
    {
      id: "escrow",
      label: "1. Escrow deposited on-chain",
      status: ["Funded","Submitted","LLMPending","Approved","Rejected","Settled"].includes(s) ? "done" : "waiting",
    },
    {
      id: "hours",
      label: "2. Worker submits hours",
      status: ["Submitted","LLMPending","Approved","Rejected","Settled"].includes(s) ? "done"
            : s === "Funded" ? "waiting" : "waiting",
    },
    {
      id: "json",
      label: "3. Somnia JSON API Agent — fetches timesheet",
      detail: "Decentralized nodes query FlexStaff API → consensus on result",
      status: s === "Submitted"  ? "running"
            : ["LLMPending","Approved","Rejected","Settled"].includes(s) ? "done"
            : "waiting",
    },
    {
      id: "llm",
      label: "4. Somnia LLM Agent — autonomous payroll decision",
      detail: shift.llmReasoning || "On-chain deterministic AI reviews shift data",
      status: s === "LLMPending" ? "running"
            : ["Approved","Rejected","Settled"].includes(s) ? (s === "Rejected" ? "failed" : "done")
            : "waiting",
    },
    {
      id: "settle",
      label: s === "Rejected" ? "5. Rejected — employer reclaims escrow" : "5. Approved — worker claims payment",
      status: s === "Settled"  ? "done"
            : s === "Approved" || s === "Rejected" ? "running"
            : "waiting",
    },
  ];
}

// ═══════════════════════════════════════════════════════════
export default function Dashboard() {
  const { getShift, getShiftCount, depositShift, submitHours, claimPayment, loading, error } =
    useShiftEscrow();

  const [shifts, setShifts]       = useState<ShiftData[]>([]);
  const [selected, setSelected]   = useState<ShiftData | null>(null);
  const [pollInterval, setPoll]   = useState<ReturnType<typeof setInterval> | null>(null);

  // Employer form state
  const [workerAddr, setWorkerAddr]     = useState("");
  const [hours, setHours]               = useState("8");
  const [rate, setRate]                 = useState("0.005"); // STT/hr
  const [shiftId, setShiftIdInput]      = useState("SHIFT-001");
  const [escrow, setEscrow]             = useState("0.5");

  // Worker form state
  const [submitShiftId, setSubmitShiftId] = useState("");
  const [submitHrs, setSubmitHrs]         = useState("8");

  // ── Load all shifts ──────────────────────────────────────
  const loadShifts = useCallback(async () => {
    try {
      const count = await getShiftCount();
      const all = await Promise.all(
        Array.from({ length: count }, (_, i) => getShift(i))
      );
      setShifts(all.reverse()); // newest first
      if (selected) {
        const updated = all.find(s => s.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch (e) {
      console.error("Failed to load shifts", e);
    }
  }, [getShift, getShiftCount, selected]);

  // Poll every 5s — agents respond asynchronously, so we need to poll
  // to see when callbacks arrive. In production, use event listeners.
  useEffect(() => {
    loadShifts();
    const iv = setInterval(loadShifts, 5000);
    setPoll(iv);
    return () => clearInterval(iv);
  }, [loadShifts]);

  // ── Employer: post a shift ───────────────────────────────
  async function handleDeposit() {
    try {
      const result = await depositShift(workerAddr, Number(hours), rate, shiftId, escrow);
      if (result.shiftId !== null) {
        alert(`✅ Shift #${result.shiftId} funded! Tx: ${result.hash}`);
      }
      await loadShifts();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  }

  // ── Worker: submit hours ─────────────────────────────────
  async function handleSubmit() {
    try {
      const hash = await submitHours(Number(submitShiftId), Number(submitHrs));
      alert(`✅ Hours submitted! The JSON API agent is now running...\nTx: ${hash}`);
      await loadShifts();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  }

  // ── Worker: claim payment ────────────────────────────────
  async function handleClaim(id: number) {
    try {
      const hash = await claimPayment(id);
      alert(`✅ Payment claimed! Tx: ${hash}`);
      await loadShifts();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  }

  const trace = agentTrace(selected);

  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">ShiftSettle</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Autonomous workforce verification · Built on{" "}
            <span className="text-purple-400">Somnia Agentic L1</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-400">Somnia Testnet</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-12 gap-6">

        {/* ── Left column: forms ── */}
        <div className="col-span-4 space-y-6">

          {/* Employer panel */}
          <section className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">
              Employer — Post a Shift
            </h2>
            <div className="space-y-3">
              <input
                className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-500 border border-gray-700 focus:border-purple-500 outline-none"
                placeholder="Worker wallet address (0x...)"
                value={workerAddr}
                onChange={e => setWorkerAddr(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="bg-gray-800 rounded px-3 py-2 text-sm text-gray-100 border border-gray-700 focus:border-purple-500 outline-none"
                  placeholder="Hours (e.g. 8)"
                  value={hours}
                  onChange={e => setHours(e.target.value)}
                />
                <input
                  className="bg-gray-800 rounded px-3 py-2 text-sm text-gray-100 border border-gray-700 focus:border-purple-500 outline-none"
                  placeholder="Rate STT/hr"
                  value={rate}
                  onChange={e => setRate(e.target.value)}
                />
              </div>
              <input
                className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-gray-100 border border-gray-700 focus:border-purple-500 outline-none"
                placeholder="External Shift ID (e.g. SHIFT-001)"
                value={shiftId}
                onChange={e => setShiftIdInput(e.target.value)}
              />
              <input
                className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-gray-100 border border-gray-700 focus:border-purple-500 outline-none"
                placeholder="Total escrow in STT (e.g. 0.5)"
                value={escrow}
                onChange={e => setEscrow(e.target.value)}
              />
              <button
                className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded py-2.5 text-sm font-semibold transition disabled:opacity-50"
                onClick={handleDeposit}
                disabled={loading}
              >
                {loading ? "Sending..." : "Deposit Escrow & Post Shift"}
              </button>
            </div>
          </section>

          {/* Worker panel */}
          <section className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <h2 className="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">
              Worker — Submit Hours
            </h2>
            <div className="space-y-3">
              <input
                className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-gray-100 border border-gray-700 focus:border-purple-500 outline-none"
                placeholder="Shift ID (number)"
                value={submitShiftId}
                onChange={e => setSubmitShiftId(e.target.value)}
              />
              <input
                className="w-full bg-gray-800 rounded px-3 py-2 text-sm text-gray-100 border border-gray-700 focus:border-purple-500 outline-none"
                placeholder="Hours worked"
                value={submitHrs}
                onChange={e => setSubmitHrs(e.target.value)}
              />
              <button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded py-2.5 text-sm font-semibold transition disabled:opacity-50"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? "Sending..." : "Submit Hours → Trigger Agents"}
              </button>
            </div>
          </section>

          {error && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* ── Middle column: shift list ── */}
        <div className="col-span-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
            All Shifts ({shifts.length})
          </h2>
          {shifts.length === 0 && (
            <p className="text-xs text-gray-600 italic">No shifts yet. Post one above.</p>
          )}
          {shifts.map(shift => (
            <button
              key={shift.id}
              onClick={() => setSelected(shift)}
              className={`w-full text-left bg-gray-900 rounded-xl p-4 border transition ${
                selected?.id === shift.id
                  ? "border-purple-500"
                  : "border-gray-800 hover:border-gray-600"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">Shift #{shift.id}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[shift.status] ?? ""}`}>
                  {shift.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 truncate">{shift.externalShiftId}</p>
              <p className="text-xs text-gray-500 mt-1">{shift.escrow} STT escrow</p>
              {shift.status === "Approved" && (
                <button
                  onClick={e => { e.stopPropagation(); handleClaim(shift.id); }}
                  className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white text-xs rounded py-1.5 font-semibold"
                >
                  Claim Payment
                </button>
              )}
            </button>
          ))}
        </div>

        {/* ── Right column: agent trace ── */}
        <div className="col-span-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Agent Pipeline {selected ? `— Shift #${selected.id}` : ""}
          </h2>

          {!selected ? (
            <p className="text-xs text-gray-600 italic">Select a shift to see the agent trace.</p>
          ) : (
            <div className="space-y-3">
              {trace.map((step, i) => (
                <div
                  key={step.id}
                  className={`rounded-lg p-4 border ${
                    step.status === "running" ? "border-purple-500 bg-purple-950/30" :
                    step.status === "done"    ? "border-green-800 bg-green-950/20" :
                    step.status === "failed"  ? "border-red-800 bg-red-950/20" :
                    "border-gray-800 bg-gray-900/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {step.status === "running" && (
                        <svg className="animate-spin w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      )}
                      {step.status === "done" && (
                        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
                        </svg>
                      )}
                      {step.status === "failed" && (
                        <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      )}
                      {step.status === "waiting" && (
                        <div className="w-4 h-4 rounded-full border border-gray-600" />
                      )}
                    </div>
                    <div>
                      <p className={`text-xs font-medium ${
                        step.status === "running" ? "text-purple-300" :
                        step.status === "done"    ? "text-green-300" :
                        step.status === "failed"  ? "text-red-300" :
                        "text-gray-500"
                      }`}>{step.label}</p>
                      {step.detail && (
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{step.detail}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* LLM reasoning detail box */}
              {selected.llmReasoning && (
                <div className="rounded-lg p-4 border border-gray-700 bg-gray-900/60 mt-2">
                  <p className="text-xs text-gray-400 font-semibold mb-1">LLM Decision (on-chain)</p>
                  <p className="text-xs text-gray-300 leading-relaxed">{selected.llmReasoning}</p>
                </div>
              )}

              {/* Explorer link */}
              <a
                href={`${SOMNIA_TESTNET.explorerUrl}/address/${selected.employer}`}
                target="_blank"
                rel="noreferrer"
                className="block text-xs text-purple-400 hover:underline mt-1"
              >
                View on Somnia Explorer →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
