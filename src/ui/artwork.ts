export const artworks = [
  {
    id: "monet-water-lilies",
    artist: "Claude Monet",
    title: "Water Lilies",
    year: "1906",
    image: "/art/monet-water-lilies.jpg",
    source: "https://artsandculture.google.com/asset/XwEbNDsEYukiWQ",
  },
  {
    id: "monet-japanese-footbridge",
    artist: "Claude Monet",
    title: "The Japanese Footbridge",
    year: "1899",
    image: "/art/monet-japanese-footbridge.jpg",
    source: "https://artsandculture.google.com/asset/RgG90GYz4QkZ4A",
  },
  {
    id: "caillebotte-paris-rainy-day",
    artist: "Gustave Caillebotte",
    title: "Paris Street; Rainy Day",
    year: "1877",
    image: "/art/caillebotte-paris-rainy-day.jpg",
    source: "https://artsandculture.google.com/asset/5wEUCOlEf-EaVQ",
  },
  {
    id: "pissarro-boulevard-montmartre",
    artist: "Camille Pissarro",
    title: "The Boulevard Montmartre on a Winter Morning",
    year: "1897",
    image: "/art/pissarro-boulevard-montmartre.jpg",
    source: "https://artsandculture.google.com/asset/4wGJB3rAyAmk2w",
  },
] as const;

export type Artwork = typeof artworks[number];
type Bag = { remaining: string[]; last: string | null };
type StoragePort = Pick<Storage, "getItem" | "setItem">;
export const ARTWORK_STORAGE_KEY = "strategy-monitor-artwork-v1";


function readBag(raw: string | null): Bag | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    const ids = artworks.map(a => a.id as string);
    if (!value || !Array.isArray(value.remaining) ||
      !value.remaining.every((id: unknown) => typeof id === "string" && ids.includes(id)) ||
      new Set(value.remaining).size !== value.remaining.length ||
      !(value.last === null || ids.includes(value.last)) || value.remaining.includes(value.last)) return null;
    return { remaining: value.remaining, last: value.last };
  } catch { return null; }
}

/** A visit consumes one work. Polling and query-string changes do not call this. */
export function createArtworkShuffler(random = Math.random) {
 let memory: Bag = { remaining: [], last: null };
 return function nextArtwork(storage?: StoragePort): Artwork {
  let bag = memory;
  try { bag = readBag(storage?.getItem(ARTWORK_STORAGE_KEY) ?? null) ?? memory; } catch { /* Storage denied: keep the in-memory cycle. */ }
  const remaining = [...bag.remaining];
  if (!remaining.length) {
    remaining.push(...artworks.map(a => a.id));
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j]!, remaining[i]!];
    }
    if (remaining[0] === bag.last && remaining.length > 1) [remaining[0], remaining[1]] = [remaining[1]!, remaining[0]!];
  }
  const id = remaining.shift()!;
  memory = { remaining, last: id };
  try { storage?.setItem(ARTWORK_STORAGE_KEY, JSON.stringify(memory)); } catch { /* In-memory history remains usable. */ }
  return artworks.find(a => a.id === id)!;
};
}

export const nextArtwork = createArtworkShuffler();
