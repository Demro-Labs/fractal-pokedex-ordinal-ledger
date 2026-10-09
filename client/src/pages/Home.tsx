import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { RarityBadge, LiveDataBlock } from "@/components/CollectionSignals";
import { MarketPanel } from "@/components/MarketPanel";
import { createRarityIndex } from "@/lib/rarity";
import { fetchLiveInscription, type LiveInscription } from "@/lib/live";
import {
  fetchAllLiveMarketListings,
  fetchLiveMarket,
  listingTokenId,
  type LiveMarket,
  type LiveMarketListing,
} from "@/lib/market";
import {
  COLLECTION_DATA_URL,
  INSCRIPTION_BASE_URL,
  SHEET_URLS,
} from "@/lib/collection";

const PER_PAGE = 20;
const TOTAL_ITEMS = 1025;
const HERO_URL = SHEET_URLS[0];
const ASSET_BASE = import.meta.env.BASE_URL;
const SOCIAL_ASSET_BASE = `${ASSET_BASE}assets/brand/social/`;
const FRACTAL_ORDINALS_URL = `${ASSET_BASE}assets/brand/fractal-ordinals.jpeg`;
const POKEDEX_LOGO_URL = `${ASSET_BASE}assets/brand/pokedex-logo.png`;
type Trait = { trait_type: string; value: string };
type PokemonRecord = {
  id: string;
  name: string;
  tokenId: string;
  attributes: Trait[];
  sheet: number;
  col: number;
  row: number;
  fileName: string;
};
function trait(record: PokemonRecord, label: string) {
  return (
    record.attributes.find(item => item.trait_type === label)?.value ?? "—"
  );
}
function shortId(id: string) {
  return `${id.slice(0, 10)}…${id.slice(-8)}`;
}
function inscriptionUrl(id: string) {
  return `${INSCRIPTION_BASE_URL}${id}`;
}
function values(records: PokemonRecord[], key: string) {
  return Array.from(
    new Set(
      records.map(record => trait(record, key)).filter(value => value !== "—")
    )
  ).sort((a, b) => a.localeCompare(b));
}
function SpriteImage({
  record,
  className = "",
}: {
  record: PokemonRecord;
  className?: string;
}) {
  return (
    <div
      className={`card-image relative aspect-square overflow-hidden bg-[#171b21] ${className}`}
    >
      <img
        src={`${ASSET_BASE}assets/fractal-pokedex/images/${record.fileName}`}
        alt={`${record.name}, Pokédex artwork`}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </div>
  );
}
function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (value: number) => void;
}) {
  const pages = Array.from(new Set([1, page - 1, page, page + 1, pageCount]))
    .filter(value => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
  return (
    <nav
      className="flex items-center justify-between gap-4 border-t border-[#2c323a] pt-5"
      aria-label="Catalogue pagination"
    >
      <button
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-[#9ea7b3] hover:text-[#f3efe5] disabled:opacity-30"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={15} /> Previous
      </button>
      <div className="flex items-center gap-1">
        {pages.map((value, index) => (
          <span key={value}>
            {index > 0 && value - pages[index - 1] > 1 && (
              <span className="px-1 text-[#718092]">…</span>
            )}
            <button
              className={`h-9 min-w-9 border px-2 font-mono text-xs ${value === page ? "border-[#f3efe5] bg-[#f3efe5] text-[#0b0d10]" : "border-transparent text-[#9ea7b3] hover:border-[#bdb3a3] hover:text-[#f3efe5]"}`}
              aria-current={value === page ? "page" : undefined}
              onClick={() => onChange(value)}
            >
              {String(value).padStart(2, "0")}
            </button>
          </span>
        ))}
      </div>
      <button
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-[#9ea7b3] hover:text-[#f3efe5] disabled:opacity-30"
        disabled={page === pageCount}
        onClick={() => onChange(page + 1)}
      >
        Next <ChevronRight size={15} />
      </button>
    </nav>
  );
}
function DetailPanel({
  record,
  onClose,
  rarity,
  live,
  liveLoading,
}: {
  record: PokemonRecord;
  onClose: () => void;
  rarity: ReturnType<typeof createRarityIndex>;
  live: LiveInscription | null;
  liveLoading: boolean;
}) {
  const token = rarity.token(record);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0d10]/80 p-4 backdrop-blur-sm"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
      role="presentation"
    >
      <section
        className="max-h-[min(760px,calc(100vh-2rem))] w-full max-w-5xl overflow-auto border border-[#3b434d] bg-[#12161b] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <div className="flex items-center justify-between border-b border-[#2c323a] px-5 py-4 sm:px-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#7f8b99]">
            Pokédex record / #{record.tokenId}
          </p>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center text-[#9ea7b3] hover:bg-[#202831] hover:text-[#f3efe5]"
            aria-label="Close record"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <div className="border border-[#2c323a] bg-[#171b21] p-3">
            <SpriteImage record={record} />
          </div>
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[#d99a54]">
              Pokédex Ordinal #{record.tokenId}
            </span>
            <h2
              id="detail-title"
              className="mt-3 font-display text-3xl font-semibold leading-tight text-[#f3efe5] sm:text-4xl"
            >
              {record.name}
            </h2>
            <div className="mt-4">
              <RarityBadge
                tier={token.tier}
                detail={`rank ${token.rank}/${token.total}`}
              />
            </div>
            <div className="mt-6 border-y border-[#2c323a] py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#718092]">
                Inscription ID
              </p>
              <a
                className="mt-2 block break-all font-mono text-xs leading-5 text-[#d9d3c6] underline decoration-[#d99a54]/40 underline-offset-4 hover:text-[#d99a54]"
                href={inscriptionUrl(record.id)}
                target="_blank"
                rel="noreferrer"
              >
                {record.id}
              </a>
            </div>
            <LiveDataBlock live={live} loading={liveLoading} />
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {record.attributes.map(item => {
                const rarityValue = rarity.trait(record, item);
                return (
                  <div
                    key={`${item.trait_type}-${item.value}`}
                    className="min-w-0 border border-[#2c323a] bg-[#14191f] p-3"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#718092]">
                      {item.trait_type}
                    </p>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                      <p className="min-w-0 break-words font-sans text-sm text-[#f3efe5]">
                        {item.value}
                      </p>
                      <RarityBadge
                        tier={rarityValue.tier}
                        detail={`${rarityValue.percentage.toFixed(1)}%`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <a
              className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[#d99a54] px-5 font-mono text-xs uppercase tracking-[0.14em] text-[#0b0d10] hover:bg-[#c77e3b]"
              href={inscriptionUrl(record.id)}
              target="_blank"
              rel="noreferrer"
            >
              Open UniSat source <ExternalLink size={15} />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
export default function Home() {
  const [records, setRecords] = useState<PokemonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [abilityFilter, setAbilityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PokemonRecord | null>(null);
  const [liveData, setLiveData] = useState<Record<string, LiveInscription>>({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [market, setMarket] = useState<LiveMarket | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState("");
  const [marketPage, setMarketPage] = useState(0);
  const [rarityFilter, setRarityFilter] = useState("all");
  const [listingFilter, setListingFilter] = useState("all");
  const [listedTokenIds, setListedTokenIds] = useState<Set<string>>(new Set());
  const [allListings, setAllListings] = useState<LiveMarketListing[]>([]);
  const [allListingsLoaded, setAllListingsLoaded] = useState(false);
  const [allListingsLoading, setAllListingsLoading] = useState(false);
  const [allListingsError, setAllListingsError] = useState("");
  const galleryRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(COLLECTION_DATA_URL, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error("Unable to load the Pokédex ledger.");
        return response.json();
      })
      .then(setRecords)
      .catch((fetchError: Error) => {
        if (fetchError.name !== "AbortError") setError(fetchError.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  const rarity = useMemo(() => createRarityIndex(records), [records]);
  useEffect(() => {
    const controller = new AbortController();
    setMarketLoading(true);
    fetchLiveMarket("pokedex", marketPage * 20, 20, controller.signal)
      .then(setMarket)
      .catch((e: Error) => {
        if (e.name !== "AbortError")
          setMarketError("Live market data is temporarily unavailable.");
      })
      .finally(() => setMarketLoading(false));
    return () => controller.abort();
  }, [marketPage]);
  useEffect(() => {
    if (!market) return;
    const controller = new AbortController();
    const total = market.totalListings;
    setAllListings([]);
    setListedTokenIds(new Set());
    setAllListingsError("");
    setAllListingsLoading(total > 0);
    setAllListingsLoaded(total === 0);
    if (total === 0) return () => controller.abort();
    fetchAllLiveMarketListings("pokedex", total, controller.signal)
      .then(items => {
        setAllListings(items);
        setListedTokenIds(
          new Set(
            items
              .map(item => listingTokenId(item.collectionItemName))
              .filter((id): id is string => Boolean(id))
          )
        );
        setAllListingsLoaded(true);
      })
      .catch((fetchError: Error) => {
        if (!controller.signal.aborted)
          setAllListingsError("Unable to sync all live UniSat listings.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setAllListingsLoading(false);
      });
    return () => controller.abort();
  }, [market?.totalListings]);
  useEffect(() => {
    if (!selected || liveData[selected.id]) return;
    const controller = new AbortController();
    setLiveLoading(true);
    fetchLiveInscription(selected.id, controller.signal)
      .then(data =>
        setLiveData(current => ({ ...current, [selected.id]: data }))
      )
      .catch(() => undefined)
      .finally(() => setLiveLoading(false));
    return () => controller.abort();
  }, [selected, liveData]);
  const typeValues = useMemo(() => values(records, "types"), [records]);
  const abilityValues = useMemo(() => values(records, "abilities"), [records]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter(record => {
      const searchable = [
        record.name,
        record.id,
        record.tokenId,
        ...record.attributes.map(item => item.value),
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!normalized || searchable.includes(normalized)) &&
        (typeFilter === "all" || trait(record, "types") === typeFilter) &&
        (abilityFilter === "all" ||
          trait(record, "abilities") === abilityFilter) &&
        (rarityFilter === "all" ||
          rarity.token(record).tier.toLowerCase() ===
            rarityFilter.toLowerCase()) &&
        (listingFilter === "all" ||
          (listingFilter === "listed"
            ? listedTokenIds.has(record.tokenId)
            : !listedTokenIds.has(record.tokenId)))
      );
    });
  }, [
    abilityFilter,
    query,
    records,
    typeFilter,
    rarity,
    rarityFilter,
    listingFilter,
    listedTokenIds,
  ]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const visible = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const first = filtered.length ? (page - 1) * PER_PAGE + 1 : 0;
  const last = Math.min(page * PER_PAGE, filtered.length);
  useEffect(
    () => setPage(1),
    [query, typeFilter, abilityFilter, rarityFilter, listingFilter]
  );
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const changePage = (next: number) => {
    setPage(next);
    galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const listingImage = (item: LiveMarketListing) => {
    const tokenId = item.collectionItemName?.match(/#(\d+)/)?.[1];
    const record = records.find(value => value.tokenId === tokenId);
    return record
      ? `${ASSET_BASE}assets/fractal-pokedex/images/${record.fileName}`
      : null;
  };
  return (
    <div className="min-h-screen bg-[#0b0d10] text-[#f3efe5]">
      <header className="border-b border-[#2c323a] bg-[#0b0d10]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
          <a
            href="#top"
            className="group flex items-center gap-3"
            aria-label="Fractal Pokédex Ordinals, back to top"
          >
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden border border-[#d99a54] bg-[#f3efe5]">
              <img
                src={POKEDEX_LOGO_URL}
                alt="Pokédex logo"
                className="h-full w-full object-cover"
              />
            </div>
            <span className="hidden items-baseline gap-2 font-display tracking-[-0.04em] sm:flex">
              <span className="text-lg font-semibold">Fractal Pokédex</span>
              <span className="text-[#d99a54]">/</span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9ea7b3]">
                Ordinals
              </span>
            </span>
          </a>
          <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[#9ea7b3] sm:gap-8">
            <span className="hidden sm:inline">Fractal Bitcoin</span>
            <a
              className="inline-flex items-center gap-1.5 text-[#f3efe5] underline decoration-[#d99a54] underline-offset-4 hover:text-[#d99a54]"
              href="https://fractal.unisat.io/market/collection?collectionId=pokedex"
              target="_blank"
              rel="noreferrer"
            >
              Collection on UniSat <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
      </header>
      <div
        id="top"
        className="mx-auto grid max-w-[1440px] lg:grid-cols-[220px_minmax(0,1fr)]"
      >
        <aside className="hidden border-r border-[#2c323a] lg:block">
          <div className="sticky top-0 flex min-h-[calc(100vh-73px)] flex-col justify-between p-8">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#718092]">
                Archive index
              </p>
              <div className="mt-8 space-y-7">
                <div>
                  <p className="font-mono text-3xl leading-none text-[#f3efe5]">
                    {TOTAL_ITEMS}
                  </p>
                  <p className="mt-2 font-sans text-xs text-[#9ea7b3]">
                    Pokédex records
                  </p>
                </div>
                <div className="h-px w-10 bg-[#d99a54]" />
                <div>
                  <p className="font-mono text-3xl leading-none text-[#f3efe5]">
                    {Math.ceil(TOTAL_ITEMS / PER_PAGE)}
                  </p>
                  <p className="mt-2 font-sans text-xs text-[#9ea7b3]">
                    plates of 20 pieces
                  </p>
                </div>
              </div>
              <div className="mt-12 border-t border-[#2c323a] pt-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#718092]">
                  Network
                </p>
                <p className="mt-2 font-sans text-sm text-[#d9d3c6]">
                  Fractal Bitcoin
                </p>
                <p className="mt-1 font-mono text-[10px] text-[#718092]">
                  Collection ID / pokedex
                </p>
              </div>
            </div>
            <div>
              <div className="mb-5 flex h-16 w-16 items-center justify-center overflow-hidden border border-[#d99a54]/70 bg-[#f3efe5]">
                <img
                  src={POKEDEX_LOGO_URL}
                  alt="Pokédex logo"
                  className="h-full w-full object-cover"
                />
              </div>
              <p className="font-mono text-[10px] leading-5 text-[#718092]">
                Every Pokémon is indexed with its original inscription ID and
                UniSat source link.
              </p>
            </div>
          </div>
        </aside>
        <main className="min-w-0">
          <section
            className="relative isolate overflow-hidden border-b border-[#2c323a] px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-20"
            style={{
              backgroundImage: `url(${HERO_URL})`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          >
            <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(11,13,16,0.99)_0%,rgba(11,13,16,0.92)_48%,rgba(11,13,16,0.42)_100%)]" />
            <div className="max-w-3xl">
              <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.24em] text-[#d99a54]">
                National Pokédex / Fractal edition
              </p>
              <h1 className="max-w-3xl font-display text-5xl font-semibold leading-[0.95] tracking-[-0.06em] text-[#f3efe5] sm:text-7xl lg:text-[6.4rem]">
                One thousand
                <br />
                <span className="text-[#d99a54]">twenty-five.</span>
              </h1>
              <p className="mt-7 max-w-lg font-sans text-base leading-7 text-[#b9c0c8] sm:text-lg">
                A living index of every Pokédex Ordinal inscribed on Fractal
                Bitcoin. Explore each Pokémon, read its stats, and return to its
                UniSat source.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[#9ea7b3]">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 bg-[#d99a54]" /> 1,025 unique records
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 bg-[#f3efe5]" /> 52 plates
                </span>
              </div>
            </div>
          </section>
          <MarketPanel
            allListings={allListings}
            allListingsLoaded={allListingsLoaded}
            allListingsLoading={allListingsLoading}
            allListingsError={allListingsError}
            market={market}
            loading={marketLoading}
            error={marketError}
            page={marketPage}
            onPage={setMarketPage}
            imageForListing={listingImage}
          />
          {loading ? (
            <div className="flex min-h-[50vh] items-center justify-center">
              <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.16em] text-[#9ea7b3]">
                <Loader2 size={16} className="animate-spin text-[#d99a54]" />{" "}
                Opening the Pokédex…
              </div>
            </div>
          ) : error ? (
            <div className="m-8 border border-[#a45e54] p-6 font-mono text-sm text-[#f3efe5]">
              {error}
            </div>
          ) : (
            <>
              <section
                className="border-y border-[#2c323a] bg-[#11161b] px-5 py-5 shadow-[inset_0_1px_0_rgba(243,239,229,0.04)] sm:px-8 lg:px-12"
                aria-label="Catalogue filters"
              >
                <div className="w-full min-w-0 border border-[#3b434d] bg-[#12161b] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.18)] sm:p-4">
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-[minmax(0,1fr)_220px_220px_220px_220px]">
                    <label className="flex h-12 min-w-0 items-center gap-3 border border-[#3b434d] bg-[#12161b] px-3 transition-colors focus-within:ring-0 focus-within:border-[#3b434d]">
                      <Search size={17} className="text-[#718092]" />
                      <input
                        type="search"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        className="h-full w-full min-w-0 bg-transparent font-mono text-xs text-[#f3efe5] outline-none placeholder:text-[#718092]"
                        placeholder="Search by name, ID, type or stat"
                        aria-label="Search the Pokédex"
                      />
                    </label>
                    <select
                      value={typeFilter}
                      onChange={event => setTypeFilter(event.target.value)}
                      className="h-12 w-full min-w-0 border border-[#3b434d] bg-[#12161b] px-3 font-mono text-xs uppercase tracking-[0.12em] text-[#d9d3c6] outline-none focus:border-[#3b434d] focus:outline-none focus:ring-0"
                    >
                      <option value="all">Type / All</option>
                      {typeValues.map(value => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <select
                      value={abilityFilter}
                      onChange={event => setAbilityFilter(event.target.value)}
                      className="h-12 w-full min-w-0 border border-[#3b434d] bg-[#12161b] px-3 font-mono text-xs uppercase tracking-[0.12em] text-[#d9d3c6] outline-none focus:border-[#3b434d] focus:outline-none focus:ring-0"
                    >
                      <option value="all">Ability / All</option>
                      {abilityValues.map(value => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <select
                      value={rarityFilter}
                      onChange={event => {
                        setRarityFilter(event.target.value);
                        setPage(1);
                      }}
                      className="h-12 w-full min-w-0 border border-[#3b434d] bg-[#12161b] px-3 font-mono text-xs uppercase tracking-[0.12em] text-[#d9d3c6] outline-none focus:border-[#3b434d] focus:outline-none focus:ring-0"
                    >
                      <option value="all">Rarity rank / All</option>
                      <option value="legendary">Legendary</option>
                      <option value="epic">Epic</option>
                      <option value="rare">Rare</option>
                      <option value="uncommon">Uncommon</option>
                      <option value="common">Common</option>
                    </select>
                    <select
                      value={listingFilter}
                      onChange={event => {
                        setListingFilter(event.target.value);
                        setPage(1);
                      }}
                      className="h-12 w-full min-w-0 border border-[#3b434d] bg-[#12161b] px-3 font-mono text-xs uppercase tracking-[0.12em] text-[#d9d3c6] outline-none focus:border-[#3b434d] focus:outline-none focus:ring-0"
                    >
                      <option value="all">Listing status / All</option>
                      <option value="listed">Listed / Live</option>
                      <option value="unlisted">Unlisted</option>
                    </select>
                  </div>
                  <div className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#718092]">
                    <Filter size={14} /> {filtered.length.toLocaleString()}{" "}
                    results ·{" "}
                    {allListingsLoading
                      ? "Syncing live UniSat listings…"
                      : allListingsError
                        ? "Live listing sync unavailable"
                        : `${listedTokenIds.size.toLocaleString()} live listed tokens`}
                  </div>
                </div>
              </section>
              <section
                ref={galleryRef}
                className="ledger-sheet border-x border-[#2c323a]/70 bg-[#0d1115] px-5 py-8 shadow-[inset_0_1px_0_rgba(243,239,229,0.04)] sm:px-8 lg:px-12"
              >
                <div className="mb-6 grid gap-3 border-b border-[#2c323a] pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div>
                    <p className="border-l-2 border-[#d99a54] pl-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d99a54]">
                      Plate {String(page).padStart(3, "0")}
                    </p>
                    <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-[#f3efe5]">
                      Pokédex index
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 sm:justify-end">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none shrink-0 font-mono text-7xl font-semibold leading-none tracking-[-0.12em] text-[#3b434d]/80 sm:text-[8rem]"
                    >
                      {String(page).padStart(3, "0")}
                    </span>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#718092]">
                      Showing {first}–{last} /{" "}
                      {filtered.length.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="mb-6 border-y border-[#2c323a] bg-[#11161b] px-3 py-3">
                  <Pagination
                    page={page}
                    pageCount={pageCount}
                    onChange={changePage}
                  />
                </div>
                {visible.length ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                    {visible.map(record => {
                      const token = rarity.token(record);
                      return (
                        <article
                          key={record.id}
                          className="group border border-[#3b434d] border-t-2 border-t-[#d99a54]/60 bg-[#12161b] p-3 shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-all hover:-translate-y-0.5 hover:border-[#d99a54]/70"
                        >
                          <button
                            className="block w-full text-left"
                            onClick={() => setSelected(record)}
                          >
                            <SpriteImage record={record} />
                            <div className="px-1 pb-1 pt-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#d99a54]">
                                  #{record.tokenId}
                                </span>
                                <span className="font-mono text-[9px] text-[#718092]">
                                  {trait(record, "types")}
                                </span>
                              </div>
                              <h3 className="mt-2 truncate font-display text-sm font-semibold text-[#f3efe5]">
                                {record.name.replace(/^Pokemon /, "")}
                              </h3>
                              <div className="mt-2">
                                <RarityBadge
                                  tier={token.tier}
                                  detail={`rank ${token.rank}`}
                                />
                              </div>
                              <p className="mt-2 truncate font-mono text-[9px] text-[#718092]">
                                {shortId(record.id)}
                              </p>
                            </div>
                          </button>
                          <a
                            className="mt-2 flex items-center justify-center gap-1 border border-[#3b434d] py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#d9d3c6] hover:border-[#d99a54] hover:text-[#d99a54]"
                            href={inscriptionUrl(record.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View inscription <ExternalLink size={11} />
                          </a>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="border border-dashed border-[#3b434d] p-12 text-center font-mono text-xs text-[#9ea7b3]">
                    No Pokémon match the current filters.
                  </div>
                )}
                <div className="mt-10">
                  <Pagination
                    page={page}
                    pageCount={pageCount}
                    onChange={changePage}
                  />
                </div>
              </section>
            </>
          )}
          <footer className="border-t border-[#2c323a] bg-[#12161b] px-5 py-10 sm:px-8 lg:px-12">
            <div className="grid gap-10 xl:grid-cols-[1fr_1.4fr]">
              <div>
                <p className="font-display text-lg font-semibold">
                  Fractal Pokédex <span className="text-[#d99a54]">/</span>{" "}
                  Ordinals
                </p>
                <p className="mt-2 max-w-md font-mono text-[10px] leading-5 text-[#9ea7b3]">
                  An independent visual index built from the supplied Pokédex
                  inscriptions and metadata. Verify every record at the source.
                </p>
                <div
                  className="mt-6 flex flex-wrap items-center gap-3"
                  aria-label="Social links"
                >
                  {[
                    {
                      label: "X / Fractal Ordinals",
                      href: "https://x.com/fractal_ordinal",
                      src: `${SOCIAL_ASSET_BASE}x.svg`,
                    },
                    {
                      label: "Facebook / Demro Labs",
                      href: "https://www.facebook.com/demrolabs",
                      src: `${SOCIAL_ASSET_BASE}facebook.svg`,
                    },
                    {
                      label: "Epsilon / @fo@epsilon.social",
                      href: "https://epsilon.social/@fo",
                      src: `${SOCIAL_ASSET_BASE}epsilon.png`,
                    },
                    {
                      label: "Link.me / Demro",
                      href: "https://link.me/demro",
                      src: `${SOCIAL_ASSET_BASE}link-me.png`,
                    },
                  ].map(social => (
                    <a
                      key={social.label}
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={social.label}
                      title={social.label}
                      className="flex h-11 w-11 items-center justify-center border border-[#3b434d] bg-[#12161b]/80 hover:border-[#d99a54] hover:bg-[#0b0d10]"
                    >
                      <img
                        src={social.src}
                        alt=""
                        className="h-6 w-6 object-contain"
                      />
                    </a>
                  ))}
                </div>
              </div>
              <div className="border-y border-[#2c323a] py-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7f8b99]">
                    Powered by
                  </p>
                  <a
                    className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#f3efe5] underline decoration-[#d99a54] underline-offset-4"
                    href="https://fractal.unisat.io/market/collection?collectionId=pokedex"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open collection on UniSat <ArrowUpRight size={13} />
                  </a>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: "Fractal Ordinals",
                      href: "https://x.com/fractal_ordinal",
                      src: FRACTAL_ORDINALS_URL,
                    },
                    {
                      label: "UniSat",
                      href: "https://unisat.io",
                      src: `${SOCIAL_ASSET_BASE}unisat.png`,
                    },
                    {
                      label: "Fractal Bitcoin",
                      href: "https://fractalbitcoin.io",
                      src: `${SOCIAL_ASSET_BASE}fractal-bitcoin.png`,
                    },
                    {
                      label: "GitHub",
                      href: "https://github.com/Demro-Labs/fractal-pokedex-ordinal-ledger",
                      src: `${SOCIAL_ASSET_BASE}github.svg`,
                    },
                  ].map(partner => (
                    <a
                      key={partner.label}
                      href={partner.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-16 items-center gap-3 border border-[#2c323a] bg-[#12161b]/70 px-3 hover:border-[#d99a54] hover:bg-[#0b0d10]"
                    >
                      <img
                        src={partner.src}
                        alt={`${partner.label} logo`}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#d9d3c6]">
                        {partner.label}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-2 border-t border-[#2c323a] pt-6 font-mono text-[10px] leading-5 text-[#718092] sm:flex-row sm:items-center sm:justify-between">
              <p>
                Copyright © 2026 Fractal Pokédex Ordinals. All rights reserved.
              </p>
              <p>Powered by Fractal Ordinals / UniSat / Fractal Bitcoin</p>
            </div>
          </footer>
        </main>
      </div>
      {selected && (
        <DetailPanel
          record={selected}
          onClose={() => setSelected(null)}
          rarity={rarity}
          live={liveData[selected.id] ?? null}
          liveLoading={liveLoading}
        />
      )}
    </div>
  );
}
