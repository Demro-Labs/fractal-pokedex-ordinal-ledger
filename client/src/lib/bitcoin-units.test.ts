import { describe, expect, it } from "vitest";
import { formatSatsAsAsset } from "./bitcoin-units";

describe("formatSatsAsAsset", () => {
  it("formats UniSat satoshi values as native coin and preserves the satoshi amount", () => {
    const result = formatSatsAsAsset(1_330_414, "FB");
    expect(result).toContain("0.01330414 FB");
    expect(result).toContain("sats");
    expect(result).toMatch(/1.?330.?414 sats/);
  });

  it("returns the unavailable label for missing or unsafe balances", () => {
    expect(formatSatsAsAsset(null, "FB")).toBe("Unavailable");
    expect(formatSatsAsAsset(Number.MAX_SAFE_INTEGER + 1, "BTC")).toBe("Unavailable");
  });
});
