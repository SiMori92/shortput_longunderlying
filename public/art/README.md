# Header artwork

**From 2026-11-22 (W-79) the collection is a URL catalogue, not stored images.** `src/ui/artwork-catalog.json` lists 131 public-domain Impressionist and Post-Impressionist works (Monet, Van Gogh, Pissarro, Renoir, Sisley, Degas, Cézanne, Manet, Gauguin, Signac, Caillebotte, Seurat, Cassatt, Morisot). Each entry holds the artist, title, year, a Wikimedia image URL (1280px thumbnail), its Google Arts & Culture page, its Commons file page and its licence.

The shared header selects a painting on each route visit, refresh, or return via the browser's back/forward cache. A shuffled bag in sessionStorage (`strategy-monitor-artwork-v2`) shows every catalogued work once before starting another cycle and avoids an immediate repeat between cycles. Normal polling and filter changes do not reshuffle. When browser storage is blocked, an in-memory bag supports navigation; reload history cannot be retained in that case.

## Where the entries come from

`tools/build-art-catalog.mjs` (`pnpm art:catalog`) reads Wikimedia Commons' "Google Art Project works by <artist>" categories — the scans Google itself published from Google Arts & Culture. A work is kept only when:

- Commons marks it **Public domain** or CC0 (`extmetadata.LicenseShortName`; recorded per entry as `license`);
- its record names a Google Arts & Culture asset id (the caption link, `https://artsandculture.google.com/asset/<id>`);
- it is landscape enough for the header crop (width ÷ height ≥ 1.1), is not a sketch or study, and is not a nude or bathing scene (the app may be screen-shared).

The selection is balanced across artists. A rebuild takes about two minutes; the script paces itself for the Commons API. Bump `ARTWORK_STORAGE_KEY` in `src/ui/artwork.ts` whenever the catalogue changes, and inspect a sample of desktop and mobile crops.

Images are hotlinked from Wikimedia, which permits it, rather than from Google's image servers, whose URLs are not stable public links. Viewers' browsers therefore request each header image from Wikimedia (the app sends `Referrer-Policy: no-referrer`); nothing is stored in the repo or the database. Google Arts & Culture is the reference destination, not a live image feed.

## The one stored image

`monet-water-lilies.jpg` (Claude Monet, _Water Lilies_, 1906; Public domain, Art Institute of Chicago artwork 16568; https://commons.wikimedia.org/wiki/File:Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg; Google Arts & Culture https://artsandculture.google.com/asset/XwEbNDsEYukiWQ) is the offline fallback, shown with its own caption when a remote image fails to load. If it also fails, the header shows a neutral surface and no caption. Browser tests serve this file in place of Wikimedia requests so they run offline.

Today hides the compact artwork on screens up to 900px to prioritise the daily decision.
