import catalog from "./artwork-catalog.json";

/**
 * W-79: the header collection is a URL catalogue (src/ui/artwork-catalog.json, built by
 * tools/build-art-catalog.mjs from Wikimedia Commons' "Google Art Project works by <artist>"
 * categories). Images are hotlinked from Wikimedia; captions open the matching Google Arts &
 * Culture page. Only the offline fallback image is stored in the repository.
 */
export type Artwork = {
  id: string;
  artist: string;
  title: string;
  year: string;
  image: string;
  sourceLabel: string;
  source: string;
};

export const artworks: readonly Artwork[] = catalog.works.map(
  ({ id, artist, title, year, image, sourceLabel, source }) => ({ id, artist, title, year, image, sourceLabel, source }),
);

/** Shown when a remote image fails to load (offline, blocked host). The only image kept in the repo. */
export const fallbackArtwork: Artwork = {
  id: "monet-water-lilies",
  artist: "Claude Monet",
  title: "Water Lilies",
  year: "1906",
  image: "/art/monet-water-lilies.jpg",
  sourceLabel: "Google Arts & Culture",
  source: "https://artsandculture.google.com/asset/XwEbNDsEYukiWQ",
};

/** "Artist · Title, Year", omitting the year when the catalogue has none. */
export function artworkCaption(art: Artwork) {
  return `${art.artist} · ${art.title}${art.year ? `, ${art.year}` : ""}`;
}

type Bag = { remaining: string[]; last: string | null };
type StoragePort = Pick<Storage, "getItem" | "setItem">;
/** Bump whenever the catalogue changes so existing sessions start a fresh bag. */
export const ARTWORK_STORAGE_KEY = "strategy-monitor-artwork-v2";
const ids = new Set(artworks.map(a => a.id));

function readBag(raw: string | null): Bag | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || !Array.isArray(value.remaining) ||
      !value.remaining.every((id: unknown) => typeof id === "string" && ids.has(id)) ||
      new Set(value.remaining).size !== value.remaining.length ||
      !(value.last === null || (typeof value.last === "string" && ids.has(value.last))) ||
      value.remaining.includes(value.last)) return null;
    return { remaining: value.remaining, last: value.last };
  } catch { return null; }
}

/**
 * Each bag contains every catalogued work once; the next bag cannot start with the previous bag's
 * last work. A visit consumes one work. Polling and query-string changes do not call this.
 */
export function createArtworkShuffler(random = Math.random) {
  let memory: Bag = { remaining: [], last: null };
  return function nextArtwork(storage?: StoragePort | null): Artwork {
    let bag = memory;
    try { bag = readBag(storage?.getItem(ARTWORK_STORAGE_KEY) ?? null) ?? memory; } catch { /* Storage denied: keep the in-memory cycle. */ }
    const remaining = [...bag.remaining];
    if (!remaining.length) {
      remaining.push(...ids);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j]!, remaining[i]!];
      }
      if (remaining.length > 1 && remaining[0] === bag.last) {
        const j = 1 + Math.floor(random() * (remaining.length - 1));
        [remaining[0], remaining[j]] = [remaining[j]!, remaining[0]!];
      }
    }
    const id = remaining.shift()!;
    memory = { remaining, last: id };
    try { storage?.setItem(ARTWORK_STORAGE_KEY, JSON.stringify(memory)); } catch { /* In-memory history remains usable. */ }
    return artworks.find(a => a.id === id)!;
  };
}

export const nextArtwork = createArtworkShuffler();
