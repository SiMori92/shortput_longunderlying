import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import catalog from "../src/ui/artwork-catalog.json";
import { ARTWORK_STORAGE_KEY, artworkCaption, artworks, createArtworkShuffler, fallbackArtwork } from "../src/ui/artwork";

function storage(initial: string | null = null) {
  let value = initial;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
}

describe("header artwork", () => {
  it("shows each work once per cycle with no immediate cycle-boundary repeat", () => {
    const next = createArtworkShuffler();
    let last: string | null = null;
    for (let cycle = 0; cycle < 20; cycle++) {
      const seen = new Set<string>();
      for (let visit = 0; visit < artworks.length; visit++) {
        const id = next().id;
        expect(id).not.toBe(last);
        seen.add(id);
        last = id;
      }
      expect(seen.size).toBe(artworks.length);
    }
  });

  it("retains the remaining cycle across reloads", () => {
    const saved = storage();
    const ids = Array.from({ length: artworks.length }, () => createArtworkShuffler()(saved).id);
    expect(new Set(ids).size).toBe(artworks.length);
    expect(JSON.parse(saved.getItem()!).remaining).toEqual([]);
    expect(createArtworkShuffler(() => 0.999)(saved).id).not.toBe(ids.at(-1));
  });

  it.each(["broken JSON", "null", JSON.stringify({ remaining: ["unknown"], last: null }), JSON.stringify({ remaining: [artworks[0]!.id, artworks[0]!.id], last: null }), JSON.stringify({ remaining: [artworks[0]!.id], last: artworks[0]!.id }), JSON.stringify({ remaining: [], last: "monet-japanese-footbridge" })])("recovers from damaged or outdated stored state: %s", raw => {
    const saved = storage(raw);
    expect(artworks).toContain(createArtworkShuffler()(saved));
    expect(JSON.parse(saved.getItem()!).remaining).toHaveLength(artworks.length - 1);
  });

  it("keeps an in-memory cycle when reading or writing storage is denied", () => {
    const denied = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    const next = createArtworkShuffler();
    expect(new Set(artworks.map(() => next(denied).id)).size).toBe(artworks.length);
  });

  it("catalogues at least 100 public-domain works as Wikimedia URLs with Google Arts & Culture pages (W-79)", () => {
    expect(ARTWORK_STORAGE_KEY).toMatch(/^strategy-monitor-/);
    expect(artworks.length).toBeGreaterThanOrEqual(100);
    expect(new Set(artworks.map(a => a.id)).size).toBe(artworks.length);
    expect(new Set(artworks.map(a => a.source)).size).toBe(artworks.length);
    for (const art of artworks) {
      const image = new URL(art.image);
      expect(image.protocol).toBe("https:");
      expect(image.hostname).toMatch(/^(upload|thumb)\.wikimedia\.org$/);
      expect(new URL(art.source).hostname).toBe("artsandculture.google.com");
      expect(art.sourceLabel).toBe("Google Arts & Culture");
      expect(art.title).toBeTruthy();
      expect(art.title).not.toMatch(/QS:/);
      expect(art.artist).toBeTruthy();
      expect(artworkCaption(art)).not.toMatch(/,\s*$/);
    }
    for (const work of catalog.works) expect(work.license).toBe("Public domain");
  });

  it("keeps exactly one local JPEG as the offline fallback", () => {
    const bytes = readFileSync(path.join(process.cwd(), "public", fallbackArtwork.image));
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(new URL(fallbackArtwork.source).hostname).toBe("artsandculture.google.com");
  });
});
