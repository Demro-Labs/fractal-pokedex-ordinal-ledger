import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_DATA_API_BASE } from "@/lib/live";
import { confirmFractalSpendableUtxos, confirmSpendableUtxos, getMempoolConfig, getMempoolRawTransaction, getRecommendedFeeEstimate, getSpendableUtxos, InsufficientSafeUtxosError, minimumSpendableSatsForScript, trackMempoolTransaction, validateMempoolAddress } from "./mempool";

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

describe("minimumSpendableSatsForScript", () => {
  it("matches the standard dust floor for supported output scripts", () => {
    expect(minimumSpendableSatsForScript(`0014${"11".repeat(20)}`)).toBe(294);
    expect(minimumSpendableSatsForScript(`5120${"22".repeat(32)}`)).toBe(330);
    expect(minimumSpendableSatsForScript(`a914${"33".repeat(20)}87`)).toBe(540);
    expect(minimumSpendableSatsForScript(`76a914${"44".repeat(20)}88ac`)).toBe(546);
    expect(minimumSpendableSatsForScript("deadbeef")).toBe(600);
  });
});

describe("validateMempoolAddress", () => {
  it.each(["BITCOIN_MAINNET", "FRACTAL_BITCOIN_MAINNET"])("validates %s locally without depending on Mempool", async network => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as typeof fetch);
    await validateMempoolAddress(network, "1BoatSLRHtKNngkdXEeobR76b53LETtpyT");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed addresses and unsupported networks locally", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as typeof fetch);
    await expect(validateMempoolAddress("BITCOIN_MAINNET", "not-a-bitcoin-address")).rejects.toThrow(/n’est pas valide/i);
    await expect(validateMempoolAddress("UNKNOWN_NETWORK", "1BoatSLRHtKNngkdXEeobR76b53LETtpyT")).rejects.toThrow(/Unsupported mainnet network/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getSpendableUtxos", () => {
  it("scans the full indexer-reported set by default even when the first UTXO covers the minimum", async () => {
    const cursors: number[] = [];
    installBrowserTimerMocks();
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const cursor = Number(url.searchParams.get("cursor"));
      cursors.push(cursor);
      return Response.json({
        chain: "fractal", address: ADDRESS, cursor, nextCursor: cursor + 25, total: 500, scannedCount: 25,
        utxo: cursor === 0 ? [{ ...SAFE_UTXO, satoshi: 600_000 }] : [],
      });
    }) as typeof fetch);
    const result = await getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, 1_700);
    expect(cursors).toHaveLength(20);
    expect(cursors[0]).toBe(0);
    expect(cursors.at(-1)).toBe(475);
    expect(result).toHaveLength(1);
    expect(result[0].satoshi).toBe(600_000);
  });
  it.each([
    { label: "P2WPKH", scriptPk: `0014${"11".repeat(20)}`, satoshi: 294 },
    { label: "P2TR", scriptPk: `5120${"22".repeat(32)}`, satoshi: 330 },
  ])("accepts a confirmed $label output at its standard dust floor", async ({ scriptPk, satoshi }) => {
    installBrowserTimerMocks();
    vi.stubGlobal("fetch", (async () => Response.json({
      chain: "fractal", address: ADDRESS, cursor: 0, nextCursor: 1, total: 1, scannedCount: 1,
      utxo: [{ ...SAFE_UTXO, scriptPk, satoshi }],
    })) as typeof fetch);
    const result = await getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, satoshi);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ scriptPk, satoshi });
  });

  it("rejects an output below its script-specific dust floor", async () => {
    installBrowserTimerMocks();
    vi.stubGlobal("fetch", (async () => Response.json({
      chain: "fractal", address: ADDRESS, cursor: 0, nextCursor: 1, total: 1, scannedCount: 1,
      utxo: [{ ...SAFE_UTXO, satoshi: 293 }],
    })) as typeof fetch);
    await expect(getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, 293))
      .rejects.toBeInstanceOf(InsufficientSafeUtxosError);
  });

  it("normalizes UniSat satoshi strings before applying safe-balance checks", async () => {
    installBrowserTimerMocks();
    vi.stubGlobal("fetch", (async () => Response.json({
      chain: "fractal", address: ADDRESS, cursor: 0, nextCursor: 1, total: 1, scannedCount: 1,
      utxo: [{ ...SAFE_UTXO, satoshi: "600000" }],
    })) as typeof fetch);
    const result = await getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, 1_700);
    expect(result).toHaveLength(1);
    expect(result[0].satoshi).toBe(600_000);
  });

  it("finds a confirmed low-fee RBF-marked output through the full 500-output index", async () => {
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

  it("collects all safe UTXOs for exact PSBT fee calculation instead of enforcing a fixed reserve", async () => {
    installBrowserTimerMocks();
    const cursors: number[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      const cursor = Number(new URL(String(input)).searchParams.get("cursor"));
      cursors.push(cursor);
      const utxo = cursor === 0
        ? [{ ...SAFE_UTXO, txid: "a".repeat(64), satoshi: 600 }]
        : [{ ...SAFE_UTXO, txid: "b".repeat(64), satoshi: 492 }];
      return Response.json({ chain: "fractal", address: ADDRESS, cursor, nextCursor: cursor + 1, total: 2, scannedCount: 1, utxo });
    }) as typeof fetch);
    const result = await getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, 1, { collectAll: true });
    expect(cursors).toEqual([0, 1]);
    expect(result.reduce((sum, item) => sum + item.satoshi, 0)).toBe(1_092);
  });

  it("continues collectAll beyond 500 outputs until the indexer total is exhausted", async () => {
    installBrowserTimerMocks();
    const cursors: number[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      const cursor = Number(new URL(String(input)).searchParams.get("cursor"));
      cursors.push(cursor);
      const scannedCount = Math.min(25, 501 - cursor);
      return Response.json({
        chain: "fractal", address: ADDRESS, cursor, nextCursor: cursor + scannedCount, total: 501, scannedCount,
        utxo: cursor === 500 ? [SAFE_UTXO] : [],
      });
    }) as typeof fetch);

    const result = await getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, 1, { collectAll: true });
    expect(cursors).toHaveLength(21);
    expect(cursors.at(-1)).toBe(500);
    expect(result).toEqual([SAFE_UTXO]);
  });

  it("fails closed when the indexer stops advancing before its reported total", async () => {
    installBrowserTimerMocks();
    vi.stubGlobal("fetch", (async () => Response.json({
      chain: "fractal", address: ADDRESS, cursor: 0, nextCursor: 0, total: 26, scannedCount: 0, utxo: [],
    })) as typeof fetch);

    await expect(getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, 1, { collectAll: true }))
      .rejects.toThrow(/scan is incomplete.*0 of 26/i);
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

  it("reports satoshi totals for rejected Rune outputs when the safe fee balance is insufficient", async () => {
    installBrowserTimerMocks();
    vi.stubGlobal("fetch", (async () => Response.json({
      chain: "fractal",
      address: ADDRESS,
      cursor: 0,
      nextCursor: 1,
      total: 1,
      scannedCount: 1,
      utxo: [],
      diagnostics: {
        identityMismatch: 0, invalidValue: 0, invalidScript: 0, unconfirmedOrInvalidHeight: 0,
        invalidFlags: 0, hasInscriptionOrUnknown: 0, detailMismatch: 0, spentOrUnknown: 0,
        hasRunes: 1, hasAlkanes: 0,
      },
      diagnosticsSats: {
        unconfirmedOrInvalidHeight: 0, invalidFlags: 0, hasInscriptionOrUnknown: 0,
        detailMismatch: 0, spentOrUnknown: 0, hasRunes: 596_598, hasAlkanes: 0,
      },
    })) as typeof fetch);

    const error = await getSpendableUtxos("FRACTAL_BITCOIN_MAINNET", ADDRESS, 1_700).catch(value => value);
    expect(error).toBeInstanceOf(InsufficientSafeUtxosError);
    expect(error.message).toContain("Rune détectée: 1");
    expect(error.message).toContain("Rune détectée: 596,598 sats");
    expect(error.message).toContain("No payment was started");
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

describe("confirmSpendableUtxos network routing", () => {
  it("sends Bitcoin Local Vault confirmation to the Worker with the Bitcoin chain key", async () => {
    installBrowserTimerMocks();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
      expect(String(input)).toBe(`${LIVE_DATA_API_BASE}/api/spendable-utxos/confirm`);
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({ chain: "bitcoin", address: ADDRESS, minimumSats: 10_400 });
      return Response.json({ chain: "bitcoin", address: ADDRESS, minimumSats: 10_400, safeSats: 10_500, sufficient: true, verifiedUtxoCount: 1, confirmedAt: new Date().toISOString() });
    });
    const result = await confirmSpendableUtxos("BITCOIN_MAINNET", ADDRESS, 10_400, [{ txid: "a".repeat(64), vout: 0, satoshi: 10_500, scriptPk: "0014" + "11".repeat(20) }]);
    expect(result).toMatchObject({ chain: "bitcoin", sufficient: true, safeSats: 10_500 });
  });
});

describe("trackMempoolTransaction network routing", () => {
  it.each([
    { network: "BITCOIN_MAINNET", label: "Bitcoin" },
    { network: "FRACTAL_BITCOIN_MAINNET", label: "Fractal Bitcoin" },
  ])("uses only the $label Mempool for its network enum", async ({ network, label }) => {
    installBrowserTimerMocks();
    const txid = "b".repeat(64);
    const urls: string[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return Response.json({ confirmed: true, block_height: 123 });
    }) as typeof fetch);

    const receipt = await trackMempoolTransaction(txid, network);

    expect(urls).toEqual([`${LIVE_DATA_API_BASE}/api/mempool/tx-status?chain=${encodeURIComponent(network)}&txid=${txid}`]);
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
    { network: "BITCOIN_MAINNET" },
    { network: "FRACTAL_BITCOIN_MAINNET" },
  ])("falls back to the selected $network Mempool through the Worker proxy for current fees", async ({ network }) => {
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
    expect(urls[1]).toBe(`${LIVE_DATA_API_BASE}/api/mempool/fees?chain=${encodeURIComponent(network)}`);
  });

  it.each(["BITCOIN_MAINNET", "FRACTAL_BITCOIN_MAINNET"])("uses a valid fallback fee when halfHourFee is present but invalid for %s", async network => {
    installBrowserTimerMocks();
    const urls: string[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (new URL(url).pathname === "/api/fees/recommended") return Response.json({ error: "Worker unavailable" }, { status: 503 });
      return Response.json({ halfHourFee: 0, fastestFee: 5, hourFee: 2, minimumFee: 1 });
    }) as typeof fetch);
    const estimate = await getRecommendedFeeEstimate(network);
    expect(estimate.feeRate).toBe(5);
    expect(estimate.network).toBe(network);
    expect(urls).toHaveLength(2);
  });

  it.each([
    { network: "BITCOIN_MAINNET", endpoint: "https://mempool.space" },
    { network: "FRACTAL_BITCOIN_MAINNET", endpoint: "https://mempool.fractalbitcoin.io" },
  ])("fetches Legacy parent hex from the matching $network Mempool via the Worker proxy", async ({ network }) => {
    installBrowserTimerMocks();
    const txid = "c".repeat(64);
    const rawHex = "02000000";
    const urls: string[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(rawHex, { status: 200, headers: { "Content-Type": "text/plain" } });
    }) as typeof fetch);
    await expect(getMempoolRawTransaction(network, txid)).resolves.toBe(rawHex);
    expect(urls).toEqual([`${LIVE_DATA_API_BASE}/api/mempool/tx-hex?chain=${encodeURIComponent(network)}&txid=${txid}`]);
  });

  it("rejects an unknown network instead of routing Legacy inputs to the wrong chain", async () => {
    installBrowserTimerMocks();
    const fetchMock = vi.fn(async () => new Response("aa", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock as typeof fetch);
    await expect(getMempoolRawTransaction("UNKNOWN_NETWORK", "c".repeat(64))).rejects.toThrow(/No Mempool endpoint/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
