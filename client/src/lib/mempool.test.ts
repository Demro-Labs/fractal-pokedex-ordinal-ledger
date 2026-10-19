import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_DATA_API_BASE } from "@/lib/live";
import { confirmFractalSpendableUtxos, getMempoolConfig, getMempoolRawTransaction, getRecommendedFeeEstimate, getSpendableUtxos, InsufficientSafeUtxosError, trackMempoolTransaction } from "./mempool";

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

  it("keeps scanning until the exact PSBT outpoint is verified", async () => {
    installBrowserTimerMocks();
    const cursors: number[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      const cursor = Number(new URL(String(input)).searchParams.get("cursor"));
      cursors.push(cursor);
      const utxo = cursor === 0 ? SAFE_UTXO : { ...SAFE_UTXO, txid: "b".repeat(64), vout: 0 };
      return Response.json({ chain: "fractal", address: ADDRESS, cursor, nextCursor: cursor + 1, total: 2, scannedCount: 1, utxo: [utxo] });
    }) as typeof fetch);

    const result = await getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, 488_045, { requiredOutpoints: [`${"b".repeat(64)}:0`] });
    expect(cursors).toEqual([0, 1]);
    expect(result).toEqual([{ ...SAFE_UTXO, txid: "b".repeat(64), vout: 0 }]);
  });

  it("rejects when the safe index only contains a different outpoint", async () => {
    installBrowserTimerMocks();
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      const cursor = Number(new URL(String(input)).searchParams.get("cursor"));
      return Response.json({ chain: "fractal", address: ADDRESS, cursor, nextCursor: cursor + 1, total: 1, scannedCount: 1, utxo: [SAFE_UTXO] });
    }) as typeof fetch);

    await expect(getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, 488_045, { requiredOutpoints: [`${"b".repeat(64)}:0`] }))
      .rejects.toThrow(/exact PSBT input/i);
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

describe("trackMempoolTransaction network routing", () => {
  it.each([
    { network: "BITCOIN_MAINNET", endpoint: "https://mempool.space", label: "Bitcoin" },
    { network: "FRACTAL_BITCOIN_MAINNET", endpoint: "https://mempool.fractalbitcoin.io", label: "Fractal Bitcoin" },
  ])("uses only the $label Mempool for its network enum", async ({ network, endpoint, label }) => {
    installBrowserTimerMocks();
    const txid = "b".repeat(64);
    const urls: string[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return Response.json({ confirmed: true, block_height: 123 });
    }) as typeof fetch);

    const receipt = await trackMempoolTransaction(txid, network);

    expect(urls).toEqual([`${endpoint}/api/tx/${txid}/status`]);
    expect(receipt).toMatchObject({ txid, network: label, status: "confirmed", blockHeight: 123 });
  });

  it("rejects an unknown network instead of defaulting to Fractal", async () => {
    installBrowserTimerMocks();
    const fetchMock = vi.fn(async () => Response.json({ confirmed: true }));
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    await expect(trackMempoolTransaction("b".repeat(64), "UNKNOWN_NETWORK"))
      .rejects.toThrow(/No Mempool endpoint/i);
    expect(getMempoolConfig("UNKNOWN_NETWORK")).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Mempool fee fallback and Legacy transaction routing", () => {
  it.each([
    { network: "BITCOIN_MAINNET", endpoint: "https://mempool.space" },
    { network: "FRACTAL_BITCOIN_MAINNET", endpoint: "https://mempool.fractalbitcoin.io" },
  ])("falls back to the selected $network Mempool for current fees", async ({ network, endpoint }) => {
    installBrowserTimerMocks();
    const urls: string[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (new URL(url).pathname === "/api/fees/recommended") return Response.json({ error: "Worker unavailable" }, { status: 503 });
      return Response.json({ halfHourFee: 3, fastestFee: 5, minimumFee: 1 });
    }) as typeof fetch);
    const estimate = await getRecommendedFeeEstimate(network);
    expect(estimate).toMatchObject({ network, feeRate: 3, strategy: "single-provider-fallback", sources: { mempool: { feeRate: 3, available: true }, unisat: { feeRate: null, available: false } } });
    expect(urls).toHaveLength(2);
    expect(urls[1]).toBe(`${endpoint}/api/v1/fees/recommended`);
  });

  it.each([
    { network: "BITCOIN_MAINNET", endpoint: "https://mempool.space" },
    { network: "FRACTAL_BITCOIN_MAINNET", endpoint: "https://mempool.fractalbitcoin.io" },
  ])("fetches Legacy parent hex from the matching $network Mempool", async ({ network, endpoint }) => {
    installBrowserTimerMocks();
    const txid = "c".repeat(64);
    const rawHex = "02000000";
    const urls: string[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(rawHex, { status: 200, headers: { "Content-Type": "text/plain" } });
    }) as typeof fetch);
    await expect(getMempoolRawTransaction(network, txid)).resolves.toBe(rawHex);
    expect(urls).toEqual([`${endpoint}/api/tx/${txid}/hex`]);
  });

  it("rejects an unknown network instead of routing Legacy inputs to the wrong chain", async () => {
    installBrowserTimerMocks();
    const fetchMock = vi.fn(async () => new Response("aa", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as typeof fetch);
    await expect(getMempoolRawTransaction("UNKNOWN_NETWORK", "c".repeat(64))).rejects.toThrow(/No Mempool endpoint/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
