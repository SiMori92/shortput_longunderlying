import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { ARTWORK_STORAGE_KEY, artworks, createArtworkShuffler } from "../src/ui/artwork";

function storage(initial: string | null = null) {
  let value = initial;
  return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
}

describe("header artwork", () => {
  it("shows each work once per cycle with no immediate cycle-boundary repeat", () => {
    const next = createArtworkShuffler(() => 0.5);
    const ids = Array.from({ length: artworks.length * 8 }, () => next().id);
    for (let i = 0; i < ids.length; i += artworks.length) {
      expect(new Set(ids.slice(i, i + artworks.length)).size).toBe(artworks.length);
      if (i) expect(ids[i]).not.toBe(ids[i - 1]);
    }
  });

  it("retains the remaining cycle across reloads", () => {
    const saved = storage();
    const ids = Array.from({ length: artworks.length }, () => createArtworkShuffler()(saved).id);
    expect(new Set(ids).size).toBe(artworks.length);
    expect(JSON.parse(saved.getItem()!).remaining).toEqual([]);
  });

  it.each(["broken JSON", "null", JSON.stringify({ remaining: ["unknown"], last: null }), JSON.stringify({ remaining: [artworks[0].id, artworks[0].id], last: null }), JSON.stringify({ remaining: [artworks[0].id], last: artworks[0].id })])("recovers from damaged stored state: %s", raw => {
    const saved = storage(raw);
    const next = createArtworkShuffler();
    expect(artworks).toContain(next(saved));
    expect(JSON.parse(saved.getItem()!).remaining).toHaveLength(artworks.length - 1);
  });

  it("keeps an in-memory cycle when reading or writing storage is denied", () => {
    const denied = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    const next = createArtworkShuffler();
    expect(new Set(artworks.map(() => next(denied).id)).size).toBe(artworks.length);
  });

  it("ships local images with HTTPS attribution and a product-specific key", () => {
    expect(ARTWORK_STORAGE_KEY).toMatch(/^strategy-monitor-/);
    for (const art of artworks) {
      expect(existsSync(path.join(process.cwd(), "public", art.image))).toBe(true);
      expect(art.source.startsWith("https://")).toBe(true);
    }
  });
});
