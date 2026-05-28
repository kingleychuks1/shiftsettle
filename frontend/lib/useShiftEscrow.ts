/**
 * frontend/lib/useShiftEscrow.ts
 *
 * React hook that wraps all contract interactions.
 * Uses viem (EVM-native, works perfectly with Somnia).
 *
 * Install: npm install viem wagmi @wagmi/core
 */

import { useState, useCallback } from "react";
import {
  createWalletClient,
  createPublicClient,
  custom,
  http,
  parseEther,
  formatEther,
  decodeEventLog,
} from "viem";
import {
  CONTRACT_ADDRESS,
  SHIFT_ESCROW_ABI,
  SOMNIA_TESTNET,
  SHIFT_STATUS,
} from "./config";

// ─── Types ────────────────────────────────────────────────────

export interface ShiftData {
  id: number;
  employer: string;
  worker: string;
  escrow: string;         // formatted STT
  agreedHours: number;
  submittedHours: number;
  verifiedHours: number;
  status: string;
  externalShiftId: string;
  llmReasoning: string;
}

// ─── Hook ─────────────────────────────────────────────────────

export function useShiftEscrow() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Build a public (read-only) client — no wallet needed
  const publicClient = createPublicClient({
    chain: {
      id: SOMNIA_TESTNET.id,
      name: SOMNIA_TESTNET.name,
      nativeCurrency: SOMNIA_TESTNET.nativeCurrency,
      rpcUrls: { default: { http: [SOMNIA_TESTNET.rpcUrl] } },
    },
    transport: http(SOMNIA_TESTNET.rpcUrl),
  });

  // Build a wallet (write) client using MetaMask/injected provider
  const getWalletClient = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("MetaMask not found. Install it at metamask.io");
    }
    return createWalletClient({
      chain: {
        id: SOMNIA_TESTNET.id,
        name: SOMNIA_TESTNET.name,
        nativeCurrency: SOMNIA_TESTNET.nativeCurrency,
        rpcUrls: { default: { http: [SOMNIA_TESTNET.rpcUrl] } },
      },
      transport: custom(window.ethereum),
    });
  }, []);

  // ── READ: fetch a single shift by ID ────────────────────────

  const getShift = useCallback(async (shiftId: number): Promise<ShiftData> => {
    const result = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: SHIFT_ESCROW_ABI,
      functionName: "shifts",
      args: [BigInt(shiftId)],
    }) as any[];

    return {
      id: shiftId,
      employer:         result[0],
      worker:           result[1],
      escrow:           formatEther(result[2]),
      agreedHourlyRate: Number(result[3]),
      agreedHours:      Number(result[4]),
      submittedHours:   Number(result[5]),
      verifiedHours:    Number(result[6]),
      status:           SHIFT_STATUS[Number(result[7])] ?? "Unknown",
      externalShiftId:  result[8],
      llmReasoning:     result[9],
    };
  }, [publicClient]);

  // ── READ: how many shifts exist so far ──────────────────────

  const getShiftCount = useCallback(async () => {
    const count = await publicClient.readContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: SHIFT_ESCROW_ABI,
      functionName: "nextShiftId",
    });
    return Number(count);
  }, [publicClient]);

  // ── WRITE: employer deposits a shift ────────────────────────

  const depositShift = useCallback(async (
    workerAddress: string,
    agreedHours: number,
    hourlyRateSTT: string,   // e.g. "0.01" for 0.01 STT per hour
    externalShiftId: string,
    escrowSTT: string        // total escrow, e.g. "0.5"
  ) => {
    setLoading(true);
    setError(null);
    try {
      const walletClient = await getWalletClient();
      const [account] = await walletClient.requestAddresses();

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: SHIFT_ESCROW_ABI,
        functionName: "depositShift",
        args: [
          workerAddress as `0x${string}`,
          BigInt(agreedHours),
          parseEther(hourlyRateSTT),
          externalShiftId,
        ],
        value: parseEther(escrowSTT),
        account,
      });

      // Wait for confirmation and return the shiftId from the event
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const log = receipt.logs.find(l => {
        try {
          const decoded = decodeEventLog({ abi: SHIFT_ESCROW_ABI as any, ...l });
          return decoded.eventName === "ShiftFunded";
        } catch { return false; }
      });
      if (log) {
        const decoded = decodeEventLog({ abi: SHIFT_ESCROW_ABI as any, ...log }) as any;
        return { hash, shiftId: Number(decoded.args.shiftId) };
      }
      return { hash, shiftId: null };
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [getWalletClient, publicClient]);

  // ── WRITE: worker submits hours ─────────────────────────────
  // Note: the worker needs to send AGENT_GAS_RESERVE STT to cover
  // the JSON API agent invocation (0.1 STT). This comes from the
  // shift escrow in the contract — worker just needs enough for gas.

  const submitHours = useCallback(async (shiftId: number, hours: number) => {
    setLoading(true);
    setError(null);
    try {
      const walletClient = await getWalletClient();
      const [account] = await walletClient.requestAddresses();

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: SHIFT_ESCROW_ABI,
        functionName: "submitHours",
        args: [BigInt(shiftId), BigInt(hours)],
        account,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [getWalletClient, publicClient]);

  // ── WRITE: worker claims payment ────────────────────────────

  const claimPayment = useCallback(async (shiftId: number) => {
    setLoading(true);
    setError(null);
    try {
      const walletClient = await getWalletClient();
      const [account] = await walletClient.requestAddresses();

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: SHIFT_ESCROW_ABI,
        functionName: "claimPayment",
        args: [BigInt(shiftId)],
        account,
      });

      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [getWalletClient, publicClient]);

  return { getShift, getShiftCount, depositShift, submitHours, claimPayment, loading, error };
}
