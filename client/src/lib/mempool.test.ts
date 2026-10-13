import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_DATA_API_BASE } from "@/lib/live";
import { getSpendableUtxos } from "./mempool";

const ADDRESS = "bc1qtestaddress0000000000000000000000000";
const SAFE_UTXO = {
  address: ADDRESS,
  txid: "a".repeat(64),
  vout: 1,
  satoshi: 488_045,
  scriptPk: `0014${"11".repeat(20)}`,
  height: 100,
  isLowFee: true,
  isOpInRBF: true,
  inscriptions: [],
  inscriptionsRunesAlkanesChecked: true,
};

function installBrowserTimerMocks() {
  vi.stubGlobal("window", {
    setTimeout: (callback: (...args: unknown[]) => void, delay?: number) => setTimeout(callback, delay),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("getSpendableUtxos", () => {
  it("finds a confirmed low-fee RBF-marked output through the bounded 500-output scan", async () => {
    installBrowserTimerMocks();
    const cursors: number[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.origin).toBe(new URL(LIVE_DATA_API_BASE).origin);
      expect(url.searchParams.get("size")).toBe("25");
      const cursor = Number(url.searchParams.get("cursor"));
      cursors.push(cursor);
      return Response.json({
        chain: "fractal",
        address: ADDRESS,
        cursor,
        nextCursor: cursor + 25,
        total: 500,
        scannedCount: 25,
        utxo: cursor === 475 ? [SAFE_UTXO] : [],
      });
    }) as typeof fetch);

    const result = await getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, 143_744);

    expect(cursors).toHaveLength(20);
    expect(cursors[0]).toBe(0);
    expect(cursors.at(-1)).toBe(475);
    expect(result).toEqual([SAFE_UTXO]);
    expect(result[0].isOpInRBF).toBe(true);
    expect(result[0].isLowFee).toBe(true);
    expect(result[0].height).toBeGreaterThan(0);
  });

  it("reports the confirmed safe total and scan coverage when funds remain insufficient", async () => {
    installBrowserTimerMocks();
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      const cursor = Number(new URL(String(input)).searchParams.get("cursor"));
      return Response.json({
        chain: "fractal",
        address: ADDRESS,
        cursor,
        nextCursor: cursor + 25,
        total: 500,
        scannedCount: 25,
        utxo: [],
      });
    }) as typeof fetch);

    await expect(getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, 143_744))
      .rejects.toThrow(/0 sats.*0 UTXO sûrs.*500\/500.*Aucun paiement n’a été lancé/);
  });
});
