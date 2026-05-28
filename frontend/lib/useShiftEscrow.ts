"use client";
import { useState, useCallback } from "react";
import {
  createWalletClient, createPublicClient,
  custom, http, parseEther, formatEther, decodeEventLog,
} from "viem";
import {
  CONTRACT_ADDRESS, SHIFT_ESCROW_ABI, SOMNIA_TESTNET,
  SHIFT_STATUS, penceToPounds,
} from "./config";

// ── Types ─────────────────────────────────────────────────────

export interface WorkerProfile {
  taxCode: string;
  niCategory: string;
  ytdGrossPence: number;
  ytdTaxPaidPence: number;
  pensionOptedIn: boolean;
  registered: boolean;
}

export interface ShiftData {
  id: number;
  employer: string;
  worker: string;
  escrow: string;
  agreedHourlyRatePence: number;
  agreedHourlyRateFormatted: string;  // e.g. "£15.00"
  agreedHours: number;
  submittedHours: number;
  verifiedHours: number;
  status: string;
  externalShiftId: string;
  weekNumber: number;
}

export interface PayslipData {
  grossPayPence: number;
  incomeTaxPence: number;
  employeeNIPence: number;
  employerNIPence: number;
  employeePensionPence: number;
  employerPensionPence: number;
  holidayPayPence: number;
  netPayPence: number;
  llmRawResponse: string;
  // formatted strings
  grossPay: string;
  incomeTax: string;
  employeeNI: string;
  employerNI: string;
  employeePension: string;
  employerPension: string;
  holidayPay: string;
  netPay: string;
  totalCostToEmployer: string;
  totalDeductions: string;
}

export interface EmployerLiabilities {
  taxToHMRC: string;
  employerNIToHMRC: string;
  pensionToProvider: string;
}

// ── Chain config object (used by viem) ───────────────────────

const somniaChain = {
  id: SOMNIA_TESTNET.id,
  name: SOMNIA_TESTNET.name,
  nativeCurrency: SOMNIA_TESTNET.nativeCurrency,
  rpcUrls: { default: { http: [SOMNIA_TESTNET.rpcUrl] } },
} as const;

// ── Hook ──────────────────────────────────────────────────────

export function useShiftEscrow() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const publicClient = createPublicClient({
    chain: somniaChain,
    transport: http(SOMNIA_TESTNET.rpcUrl),
  });

  const getWalletClient = useCallback(async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      throw new Error("MetaMask not found. Install it at metamask.io");
    }
    return createWalletClient({
      chain: somniaChain,
      transport: custom((window as any).ethereum),
    });
  }, []);

  // ── Format raw contract tuple into ShiftData ─────────────────

  function formatShift(id: number, r: any[]): ShiftData {
    return {
      id,
      employer:               r[0],
      worker:                 r[1],
      escrow:                 formatEther(r[2]),
      agreedHourlyRatePence:  Number(r[3]),
      agreedHourlyRateFormatted: penceToPounds(Number(r[3])),
      agreedHours:            Number(r[4]),
      submittedHours:         Number(r[5]),
      verifiedHours:          Number(r[6]),
      status:                 SHIFT_STATUS[Number(r[7])] ?? "Unknown",
      externalShiftId:        r[8],
      weekNumber:             Number(r[9]),
    };
  }

  // ── Format payslip tuple ─────────────────────────────────────

  function formatPayslip(r: any[]): PayslipData {
    const gross   = Number(r[0]);
    const tax     = Number(r[1]);
    const eNI     = Number(r[2]);
    const erNI    = Number(r[3]);
    const ePen    = Number(r[4]);
    const erPen   = Number(r[5]);
    const hol     = Number(r[6]);
    const net     = Number(r[7]);
    return {
      grossPayPence:        gross,
      incomeTaxPence:       tax,
      employeeNIPence:      eNI,
      employerNIPence:      erNI,
      employeePensionPence: ePen,
      employerPensionPence: erPen,
      holidayPayPence:      hol,
      netPayPence:          net,
      llmRawResponse:       r[8],
      grossPay:             penceToPounds(gross),
      incomeTax:            penceToPounds(tax),
      employeeNI:           penceToPounds(eNI),
      employerNI:           penceToPounds(erNI),
      employeePension:      penceToPounds(ePen),
      employerPension:      penceToPounds(erPen),
      holidayPay:           penceToPounds(hol),
      netPay:               penceToPounds(net),
      totalDeductions:      penceToPounds(tax + eNI + ePen),
      totalCostToEmployer:  penceToPounds(gross + erNI + erPen),
    };
  }

  // ── READ: worker profile ─────────────────────────────────────

  const getWorkerProfile = useCallback(async (address: string): Promise<WorkerProfile | null> => {
    const r = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: SHIFT_ESCROW_ABI,
      functionName: "workerProfiles",
      args: [address as `0x${string}`],
    }) as any[];
    if (!r[5]) return null; // not registered
    return {
      taxCode:        r[0],
      niCategory:     r[1],
      ytdGrossPence:  Number(r[2]),
      ytdTaxPaidPence: Number(r[3]),
      pensionOptedIn: r[4],
      registered:     r[5],
    };
  }, [publicClient]);

  // ── READ: single shift ───────────────────────────────────────

  const getShift = useCallback(async (shiftId: number): Promise<ShiftData> => {
    const r = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: SHIFT_ESCROW_ABI,
      functionName: "shifts",
      args: [BigInt(shiftId)],
    }) as any[];
    return formatShift(shiftId, r);
  }, [publicClient]);

  // ── READ: payslip ────────────────────────────────────────────

  const getPayslip = useCallback(async (shiftId: number): Promise<PayslipData | null> => {
    const r = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: SHIFT_ESCROW_ABI,
      functionName: "payslips",
      args: [BigInt(shiftId)],
    }) as any[];
    if (Number(r[0]) === 0) return null; // no payslip yet
    return formatPayslip(r);
  }, [publicClient]);

  // ── READ: shift count ────────────────────────────────────────

  const getShiftCount = useCallback(async () => {
    const n = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: SHIFT_ESCROW_ABI,
      functionName: "nextShiftId",
    });
    return Number(n);
  }, [publicClient]);

  // ── READ: employer liabilities ───────────────────────────────

  const getEmployerLiabilities = useCallback(async (employer: string): Promise<EmployerLiabilities> => {
    const r = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: SHIFT_ESCROW_ABI,
      functionName: "employerLiabilities",
      args: [employer as `0x${string}`],
    }) as any[];
    return {
      taxToHMRC:        penceToPounds(Number(r[0])),
      employerNIToHMRC: penceToPounds(Number(r[1])),
      pensionToProvider: penceToPounds(Number(r[2])),
    };
  }, [publicClient]);

  // ── WRITE: register worker ───────────────────────────────────

  const registerWorker = useCallback(async (
    taxCode: string,
    niCategory: string,
    ytdGrossPence: number,
    ytdTaxPaidPence: number,
    pensionOptedIn: boolean
  ) => {
    setLoading(true); setError(null);
    try {
      const wc = await getWalletClient();
      const [account] = await wc.requestAddresses();
      const hash = await wc.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: SHIFT_ESCROW_ABI,
        functionName: "registerWorker",
        args: [taxCode, niCategory, BigInt(ytdGrossPence), BigInt(ytdTaxPaidPence), pensionOptedIn],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (e: any) { setError(e.message); throw e; }
    finally { setLoading(false); }
  }, [getWalletClient, publicClient]);

  // ── WRITE: deposit shift ─────────────────────────────────────

  const depositShift = useCallback(async (
    worker: string,
    agreedHours: number,
    agreedHourlyRatePence: number,
    externalShiftId: string,
    weekNumber: number,
    escrowSTT: string
  ) => {
    setLoading(true); setError(null);
    try {
      const wc = await getWalletClient();
      const [account] = await wc.requestAddresses();
      const hash = await wc.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: SHIFT_ESCROW_ABI,
        functionName: "depositShift",
        args: [
          worker as `0x${string}`,
          BigInt(agreedHours),
          BigInt(agreedHourlyRatePence),
          externalShiftId,
          BigInt(weekNumber),
        ],
        value: parseEther(escrowSTT),
        account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      let shiftId: number | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: SHIFT_ESCROW_ABI as any, ...log }) as any;
          if (decoded.eventName === "ShiftFunded") {
            shiftId = Number(decoded.args.shiftId);
            break;
          }
        } catch {}
      }
      return { hash, shiftId };
    } catch (e: any) { setError(e.message); throw e; }
    finally { setLoading(false); }
  }, [getWalletClient, publicClient]);

  // ── WRITE: submit hours ──────────────────────────────────────

  const submitHours = useCallback(async (shiftId: number, hours: number) => {
    setLoading(true); setError(null);
    try {
      const wc = await getWalletClient();
      const [account] = await wc.requestAddresses();
      const hash = await wc.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: SHIFT_ESCROW_ABI,
        functionName: "submitHours",
        args: [BigInt(shiftId), BigInt(hours)],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (e: any) { setError(e.message); throw e; }
    finally { setLoading(false); }
  }, [getWalletClient, publicClient]);

  // ── WRITE: claim payment ─────────────────────────────────────

  const claimPayment = useCallback(async (shiftId: number) => {
    setLoading(true); setError(null);
    try {
      const wc = await getWalletClient();
      const [account] = await wc.requestAddresses();
      const hash = await wc.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: SHIFT_ESCROW_ABI,
        functionName: "claimPayment",
        args: [BigInt(shiftId)],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (e: any) { setError(e.message); throw e; }
    finally { setLoading(false); }
  }, [getWalletClient, publicClient]);

  return {
    loading, error,
    getWorkerProfile, getShift, getPayslip, getShiftCount, getEmployerLiabilities,
    registerWorker, depositShift, submitHours, claimPayment,
  };
}
