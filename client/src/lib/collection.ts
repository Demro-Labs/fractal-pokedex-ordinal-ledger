/** Local asset map for the Fractal Pokédex Ordinals GitHub Pages release. */
export const COLLECTION_DATA_URL = `${import.meta.env.BASE_URL}assets/fractal-pokedex/collection-data.json`;
export const SHEET_URLS = Array.from(
  { length: 11 },
  (_, index) => `${import.meta.env.BASE_URL}assets/fractal-pokedex/sheets/sheet-${String(index).padStart(3, "0")}.webp`,
);
export const INSCRIPTION_BASE_URL = "https://fractal.unisat.io/inscription/";
