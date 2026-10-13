const SATOSHIS_PER_COIN = 100_000_000;

export function formatSatsAsAsset(value: number | null | undefined, asset: string): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return "Indisponible";
  const coinValue = (value / SATOSHIS_PER_COIN).toLocaleString("fr-FR", {
    minimumFractionDigits: 8,
    maximumFractionDigits: 8,
  });
  return `${coinValue} ${asset} (${value.toLocaleString("fr-FR")} sats)`;
}
