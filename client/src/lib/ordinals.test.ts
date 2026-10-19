import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAddressOrdinals, fetchAddressOrdinalsForDisplay, type OrdinalNetwork } from "./ordinals";

const address = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";
const txid = (index: number) => index.toString(16).padStart(64, "a");
const item = (index: number) => ({
  inscriptionId: `${txid(index)}i${index}`,
  inscriptionNumber: index,
  location: `${txid(index)}:0:0`,
  outputValue: 546,
  contentType: "image/png",
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Local Vault Ordinals pagination", () => {
  it.each(["BITCOIN_MAINNET", "FRACTAL_BITCOIN_MAINNET"] as OrdinalNetwork[])(
    "loads every page and verifies offsets on %s",
    async network => {
      const calls: string[] = [];
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        calls.push(url.search);
        const start = Number(url.searchParams.get("start"));
        const detail = Array.from({ length: Math.min(50, 51 - start) }, (_, index) => item(start + index));
        return Response.json({
          network,
          address,
          start,
          total: 51,
          detail,
          refreshedAt: "2026-10-19T00:00:00.000Z",
        });
      }));

      const result = await fetchAddressOrdinalsForDisplay(address, network);

      expect(calls).toHaveLength(2);
      expect(calls.map(query => new URLSearchParams(query).get("start"))).toEqual(["0", "50"]);
      expect(result.total).toBe(51);
      expect(result.detail).toHaveLength(51);
      expect(result.detail[0].inscriptionId).toBe(item(0).inscriptionId);
      expect(result.detail[50].inscriptionId).toBe(item(50).inscriptionId);
    },
  );

  it("rejects a short page instead of silently displaying an incomplete wallet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      network: "BITCOIN_MAINNET",
      address,
      start: 0,
      total: 51,
      detail: [item(0)],
      refreshedAt: "2026-10-19T00:00:00.000Z",
    })));

    await expect(fetchAddressOrdinalsForDisplay(address, "BITCOIN_MAINNET"))
      .rejects.toThrow(/incomplete first page/i);
  });

  it("rejects duplicate inscription IDs across pages", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const start = Number(url.searchParams.get("start"));
      const detail = start === 0
        ? Array.from({ length: 50 }, (_, index) => item(index))
        : [item(49)];
      return Response.json({
        network: "BITCOIN_MAINNET",
        address,
        start,
        total: 51,
        detail,
        refreshedAt: "2026-10-19T00:00:00.000Z",
      });
    }));

    await expect(fetchAddressOrdinalsForDisplay(address, "BITCOIN_MAINNET"))
      .rejects.toThrow(/duplicate inscription/i);
  });

  it("keeps the local signer's conservative 1,000-inscription safety cap", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      network: "BITCOIN_MAINNET",
      address,
      start: 0,
      total: 1_001,
      detail: Array.from({ length: 50 }, (_, index) => item(index)),
      refreshedAt: "2026-10-19T00:00:00.000Z",
    })));

    await expect(fetchAddressOrdinals(address, "BITCOIN_MAINNET"))
      .rejects.toThrow(/at most 1000 inscriptions/i);
  });
});
