"use client";

import { useState, useEffect, useCallback } from "react";
import { useShiftEscrow, ShiftData, PayslipData } from "../lib/useShiftEscrow";
import { NI_CATEGORIES, COMMON_TAX_CODES, getCurrentWeekNumber, penceToPounds, SOMNIA_TESTNET } from "../lib/config";
import Payslip from "../components/Payslip";

// ── Status styles ─────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  Funded:     "bg-blue-500/20 text-blue-300 border-blue-500/30",
  Submitted:  "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  LLMPending: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Approved:   "bg-green-500/20 text-green-300 border-green-500/30",
  Rejected:   "bg-red-500/20 text-red-300 border-red-500/30",
  Settled:    "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  Submitted:  "JSON API Agent running…",
  LLMPending: "Payroll LLM Agent running…",
  Approved:   "Payslip calculated ✓",
  Rejected:   "Rejected",
  Settled:    "Settled",
  Funded:     "Awaiting worker",
};

type Tab = "employer" | "worker" | "liabilities";

// ═══════════════════════════════════════════════════════════════
export default function Dashboard() {
  const {
    loading, error,
    getShift, getShiftCount, getPayslip, getEmployerLiabilities,
    registerWorker, depositShift, submitHours, claimPayment,
  } = useShiftEscrow();

  const [tab, setTab]               = useState<Tab>("employer");
  const [shifts, setShifts]         = useState<ShiftData[]>([]);
  const [selected, setSelected]     = useState<ShiftData | null>(null);
  const [payslip, setPayslip]       = useState<PayslipData | null>(null);
  const [liabilities, setLiabilities] = useState<{ taxToHMRC: string; employerNIToHMRC: string; pensionToProvider: string } | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");

  // ── Employer form ──────────────────────────────────────────
  const [workerAddr, setWorkerAddr]   = useState("");
  const [hours, setHours]             = useState("8");
  const [ratePounds, setRatePounds]   = useState("15.00"); // £15/hr
  const [shiftIdExt, setShiftIdExt]   = useState("SHIFT-001");
  const [escrowSTT, setEscrowSTT]     = useState("0.5");

  // ── Worker registration form ──────────────────────────────
  const [regTaxCode, setRegTaxCode]       = useState("1257L");
  const [regNICategory, setRegNICategory] = useState("A");
  const [regYtdGross, setRegYtdGross]     = useState("0");
  const [regYtdTax, setRegYtdTax]         = useState("0");
  const [regPension, setRegPension]       = useState(true);

  // ── Worker submit form ────────────────────────────────────
  const [submitShiftId, setSubmitShiftId] = useState("");
  const [submitHrs, setSubmitHrs]         = useState("8");

  // ── Connect wallet & load data ────────────────────────────

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      (window as any).ethereum.request({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          if (accounts[0]) setWalletAddress(accounts[0]);
        });
    }
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const count = await getShiftCount();
      const all = await Promise.all(Array.from({ length: count }, (_, i) => getShift(i)));
      setShifts(all.reverse());
      if (selected) {
        const updated = all.find(s => s.id === selected.id);
        if (updated) {
          setSelected(updated);
          if (["Approved", "Settled"].includes(updated.status)) {
            const slip = await getPayslip(updated.id);
            setPayslip(slip);
          }
        }
      }
    } catch (e) { console.error(e); }
  }, [getShift, getShiftCount, getPayslip, selected]);

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 5000);
    return () => clearInterval(iv);
  }, [loadAll]);

  // When selecting a shift, load its payslip if available
  const selectShift = async (shift: ShiftData) => {
    setSelected(shift);
    setPayslip(null);
    if (["Approved", "Settled"].includes(shift.status)) {
      const slip = await getPayslip(shift.id);
      setPayslip(slip);
    }
    if (walletAddress) {
      const liab = await getEmployerLiabilities(walletAddress);
      setLiabilities(liab);
    }
  };

  // ── Handlers ──────────────────────────────────────────────

  async function handleConnectWallet() {
    if ((window as any).ethereum) {
      const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
      setWalletAddress(accounts[0] ?? "");
    }
  }

  async function handleRegisterWorker() {
    try {
      await registerWorker(
        regTaxCode, regNICategory,
        Math.round(parseFloat(regYtdGross) * 100),
        Math.round(parseFloat(regYtdTax) * 100),
        regPension
      );
      alert("✅ Worker profile registered on-chain!");
    } catch (e: any) { alert(e.message); }
  }

  async function handleDeposit() {
    try {
      const ratePence = Math.round(parseFloat(ratePounds) * 100);
      const result = await depositShift(
        workerAddr, parseInt(hours), ratePence,
        shiftIdExt, getCurrentWeekNumber(), escrowSTT
      );
      alert(`✅ Shift #${result.shiftId} funded!`);
      await loadAll();
    } catch (e: any) { alert(e.message); }
  }

  async function handleSubmitHours() {
    try {
      await submitHours(parseInt(submitShiftId), parseInt(submitHrs));
      alert("✅ Hours submitted! JSON API Agent is now running on Somnia…");
      await loadAll();
    } catch (e: any) { alert(e.message); }
  }

  async function handleClaim(id: number) {
    try {
      await claimPayment(id);
      alert("✅ Net pay claimed!");
      await loadAll();
    } catch (e: any) { alert(e.message); }
  }

  // ── Pipeline steps ─────────────────────────────────────────

  const pipelineSteps = selected ? [
    { label: "Escrow deposited", done: true, running: false },
    {
      label: "Worker submits hours",
      done: ["Submitted","LLMPending","Approved","Rejected","Settled"].includes(selected.status),
      running: false,
    },
    {
      label: "JSON API Agent — timesheet verification",
      sub: "Somnia nodes query FlexStaff API · consensus required",
      done: ["LLMPending","Approved","Rejected","Settled"].includes(selected.status),
      running: selected.status === "Submitted",
      failed: selected.status === "Rejected" && !["LLMPending","Approved","Settled"].includes(selected.status),
    },
    {
      label: "LLM Payroll Agent — UK statutory calculations",
      sub: "PAYE · NI · Pension · Holiday Pay · Deterministic on-chain AI",
      done: ["Approved","Settled"].includes(selected.status),
      running: selected.status === "LLMPending",
      failed: selected.status === "Rejected",
    },
    {
      label: selected.status === "Rejected" ? "Rejected — employer reclaims" : "Worker claims net pay",
      done: selected.status === "Settled",
      running: selected.status === "Approved",
    },
  ] : [];

  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-mono text-sm">

      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-base font-bold">ShiftSettle</h1>
            <p className="text-xs text-gray-500">Autonomous UK payroll · <span className="text-purple-400">Somnia Agentic L1</span></p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {walletAddress ? (
            <span className="text-xs text-gray-400 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              {walletAddress.slice(0,6)}…{walletAddress.slice(-4)}
            </span>
          ) : (
            <button onClick={handleConnectWallet}
              className="text-xs bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-full font-semibold transition">
              Connect Wallet
            </button>
          )}
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Somnia Testnet
          </span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-12 gap-5">

        {/* ── Left: Forms ── */}
        <div className="col-span-4 space-y-4">

          {/* Tab selector */}
          <div className="flex gap-1 bg-white/5 rounded-lg p-1">
            {(["employer","worker","liabilities"] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded text-xs font-semibold capitalize transition ${
                  tab === t ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"
                }`}>{t}</button>
            ))}
          </div>

          {/* Employer tab */}
          {tab === "employer" && (
            <div className="space-y-4">
              <Card title="Post a Shift">
                <Field label="Worker address (0x…)">
                  <Input value={workerAddr} onChange={setWorkerAddr} placeholder="0x…" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Hours">
                    <Input value={hours} onChange={setHours} placeholder="8" />
                  </Field>
                  <Field label="Gross rate (£/hr)">
                    <Input value={ratePounds} onChange={setRatePounds} placeholder="15.00" />
                  </Field>
                </div>
                <Field label="External shift ID">
                  <Input value={shiftIdExt} onChange={setShiftIdExt} placeholder="SHIFT-001" />
                </Field>
                <Field label="Escrow (STT)" hint="Send ~20% more than gross to cover employer NI + pension">
                  <Input value={escrowSTT} onChange={setEscrowSTT} placeholder="0.5" />
                </Field>
                <Btn onClick={handleDeposit} loading={loading} color="purple">
                  Deposit Escrow & Post Shift
                </Btn>
                <p className="text-xs text-gray-500 mt-1">
                  Estimated gross: £{((parseFloat(hours)||0) * (parseFloat(ratePounds)||0)).toFixed(2)} ·
                  Employer cost ~£{((parseFloat(hours)||0) * (parseFloat(ratePounds)||0) * 1.168).toFixed(2)} inc. NI+pension
                </p>
              </Card>
            </div>
          )}

          {/* Worker tab */}
          {tab === "worker" && (
            <div className="space-y-4">
              <Card title="Register Profile (once)">
                <Field label="Tax code">
                  <select value={regTaxCode} onChange={e => setRegTaxCode(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-2 text-xs text-white focus:border-purple-500 outline-none">
                    {COMMON_TAX_CODES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="NI category">
                  <select value={regNICategory} onChange={e => setRegNICategory(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded px-2 py-2 text-xs text-white focus:border-purple-500 outline-none">
                    {NI_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="YTD gross (£)">
                    <Input value={regYtdGross} onChange={setRegYtdGross} placeholder="0.00" />
                  </Field>
                  <Field label="YTD tax paid (£)">
                    <Input value={regYtdTax} onChange={setRegYtdTax} placeholder="0.00" />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={regPension} onChange={e => setRegPension(e.target.checked)}
                    className="accent-purple-500" />
                  Auto-enrolment pension (recommended)
                </label>
                <Btn onClick={handleRegisterWorker} loading={loading} color="blue">
                  Register Worker Profile On-Chain
                </Btn>
              </Card>

              <Card title="Submit Hours">
                <Field label="Shift ID">
                  <Input value={submitShiftId} onChange={setSubmitShiftId} placeholder="0" />
                </Field>
                <Field label="Hours worked">
                  <Input value={submitHrs} onChange={setSubmitHrs} placeholder="8" />
                </Field>
                <Btn onClick={handleSubmitHours} loading={loading} color="blue">
                  Submit Hours → Trigger Agents
                </Btn>
              </Card>
            </div>
          )}

          {/* Liabilities tab */}
          {tab === "liabilities" && (
            <Card title="HMRC & Pension Liabilities">
              {liabilities ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Cumulative amounts your account owes, recorded on-chain across all settled shifts.
                  </p>
                  <LiabRow label="Income Tax → HMRC (RTI)" value={liabilities.taxToHMRC} color="text-red-400" />
                  <LiabRow label="Employer NI → HMRC" value={liabilities.employerNIToHMRC} color="text-orange-400" />
                  <LiabRow label="Pension → Provider (both sides)" value={liabilities.pensionToProvider} color="text-yellow-400" />
                  <p className="text-xs text-gray-500 pt-2 border-t border-white/10">
                    These are not paid on-chain. Remit via your PAYE scheme and pension provider portal.
                    All amounts are on-chain and audit-ready for HMRC.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Connect wallet and select a shift to see liabilities.</p>
              )}
            </Card>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-xs text-red-300">{error}</div>
          )}
        </div>

        {/* ── Middle: Shift list ── */}
        <div className="col-span-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
            Shifts ({shifts.length}) · auto-refresh 5s
          </p>
          <div className="space-y-2">
            {shifts.length === 0 && (
              <p className="text-xs text-gray-600 italic">No shifts yet.</p>
            )}
            {shifts.map(s => (
              <button key={s.id} onClick={() => selectShift(s)}
                className={`w-full text-left rounded-xl p-3.5 border transition ${
                  selected?.id === s.id ? "border-purple-500 bg-purple-500/10" : "border-white/8 bg-white/3 hover:border-white/20"
                }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-xs">Shift #{s.id}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLES[s.status]}`}>
                    {s.status}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">{s.externalShiftId}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {s.agreedHours}h @ {s.agreedHourlyRateFormatted}/hr · {s.escrow} STT
                </p>
                {s.status === "Approved" && (
                  <button onClick={e => { e.stopPropagation(); handleClaim(s.id); }}
                    className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white text-xs rounded py-1.5 font-semibold">
                    Claim Net Pay
                  </button>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: Pipeline + Payslip ── */}
        <div className="col-span-5 space-y-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Agent Pipeline {selected ? `— Shift #${selected.id}` : ""}
          </p>

          {!selected && (
            <p className="text-xs text-gray-600 italic">Select a shift to see the pipeline.</p>
          )}

          {selected && (
            <>
              {/* Pipeline steps */}
              <div className="space-y-2">
                {pipelineSteps.map((step, i) => (
                  <div key={i} className={`rounded-lg px-4 py-3 border ${
                    step.running ? "border-purple-500 bg-purple-500/10" :
                    step.failed  ? "border-red-500 bg-red-500/10" :
                    step.done    ? "border-green-600/40 bg-green-500/5" :
                    "border-white/8 bg-white/3"
                  }`}>
                    <div className="flex items-center gap-3">
                      {step.running && (
                        <svg className="animate-spin w-3.5 h-3.5 text-purple-400 shrink-0" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      )}
                      {!step.running && step.done && (
                        <svg className="w-3.5 h-3.5 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                        </svg>
                      )}
                      {step.failed && (
                        <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      )}
                      {!step.running && !step.done && !step.failed && (
                        <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
                      )}
                      <div>
                        <p className={`text-xs ${step.running ? "text-purple-300" : step.done ? "text-green-300" : step.failed ? "text-red-300" : "text-gray-500"}`}>
                          {step.label}
                        </p>
                        {step.sub && (
                          <p className="text-[10px] text-gray-600 mt-0.5">{step.sub}</p>
                        )}
                        {step.running && (
                          <p className="text-[10px] text-purple-400 mt-0.5 animate-pulse">
                            {STATUS_LABELS[selected.status]}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Payslip */}
              {payslip && (
                <Payslip
                  shiftId={selected.id}
                  externalShiftId={selected.externalShiftId}
                  workerAddress={selected.worker}
                  agreedHours={selected.agreedHours}
                  weekNumber={selected.weekNumber}
                  payslip={payslip}
                />
              )}

              {/* Explorer link */}
              <a href={`${SOMNIA_TESTNET.explorerUrl}/address/${CONTRACT_ADDRESS}`}
                target="_blank" rel="noreferrer"
                className="block text-xs text-purple-400 hover:underline">
                View contract on Somnia Explorer →
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── UI micro-components ───────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/3 rounded-xl p-4 border border-white/8 space-y-3">
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-gray-500">{label}{hint && <span className="text-gray-600"> — {hint}</span>}</p>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-purple-500 outline-none" />
  );
}

function Btn({ onClick, loading, color, children }: { onClick: () => void; loading: boolean; color: "purple" | "blue"; children: React.ReactNode }) {
  const cls = color === "purple" ? "bg-purple-600 hover:bg-purple-700" : "bg-blue-600 hover:bg-blue-700";
  return (
    <button onClick={onClick} disabled={loading}
      className={`w-full ${cls} text-white rounded py-2.5 text-xs font-semibold transition disabled:opacity-50`}>
      {loading ? "Sending…" : children}
    </button>
  );
}

function LiabRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between items-center border-b border-white/5 pb-2">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-xs font-bold ${color}`}>{value}</span>
    </div>
  );
}
