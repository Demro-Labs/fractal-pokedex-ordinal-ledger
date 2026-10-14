import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_DATA_API_BASE } from "@/lib/live";
import { confirmFractalSpendableUtxos, getSpendableUtxos, InsufficientSafeUtxosError } from "./mempool";

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

    const error = await getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, 143_744).catch(value => value);
    expect(error).toBeInstanceOf(InsufficientSafeUtxosError);
    expect(error).toHaveProperty("message", expect.stringMatching(/0 sats.*0 safe UTXOs.*500\/500.*No payment was started/));
  });
});

describe("confirmFractalSpendableUtxos", () => {
  it("posts the PSBT inputs to the Worker and requires a sufficient attestation", async () => {
    installBrowserTimerMocks();
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      expect(String(input)).toBe(`${LIVE_DATA_API_BASE}/api/spendable-utxos/confirm`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toMatchObject({ chain: "fractal", address: ADDRESS, minimumSats: 20_500, utxos: [{ txid: "a".repeat(64), vout: 1, satoshi: 21_000 }] });
      return Response.json({ chain: "fractal", address: ADDRESS, minimumSats: 20_500, safeSats: 21_000, sufficient: true, verifiedUtxoCount: 1, confirmedAt: new Date().toISOString() });
    }) as typeof fetch);
    await expect(confirmFractalSpendableUtxos(ADDRESS, 20_500, [{ txid: "a".repeat(64), vout: 1, satoshi: 21_000, scriptPk: SAFE_UTXO.scriptPk }]))
      .resolves.toMatchObject({ sufficient: true, safeSats: 21_000 });
  });

  it("raises a typed shortage when the Worker does not confirm enough sats", async () => {
    installBrowserTimerMocks();
    vi.stubGlobal("fetch", (async () => Response.json({ chain: "fractal", address: ADDRESS, minimumSats: 20_500, safeSats: 18_000, sufficient: false, verifiedUtxoCount: 1, confirmedAt: new Date().toISOString() })) as typeof fetch);
    await expect(confirmFractalSpendableUtxos(ADDRESS, 20_500, [{ txid: "a".repeat(64), vout: 1, satoshi: 18_000, scriptPk: SAFE_UTXO.scriptPk }]))
      .rejects.toBeInstanceOf(InsufficientSafeUtxosError);
  });
});
