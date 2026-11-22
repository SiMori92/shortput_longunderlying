"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { artworkCaption, fallbackArtwork, nextArtwork, type Artwork } from "@/ui/artwork";

export function ArtworkHeader() {
  const pathname = usePathname();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  useEffect(() => {
    let disposed = false;
    let pending: HTMLImageElement | null = null;
    function load(art: Artwork, onError: () => void) {
      if (pending) { pending.onload = null; pending.onerror = null; }
      const image = new Image();
      pending = image;
      image.onload = () => { if (!disposed) setArtwork(art); };
      image.onerror = () => { if (!disposed) onError(); };
      image.src = art.image;
    }
    function select() {
      let storage: Storage | undefined;
      try { storage = window.sessionStorage; } catch { /* Private browsing can deny storage. */ }
      // Remote (Wikimedia) image first; on failure the one locally stored work; if that also fails, a neutral header.
      load(nextArtwork(storage), () => load(fallbackArtwork, () => setArtwork(null)));
    }
    // Strict Mode's discarded mount must not consume a work.
    const timer = window.setTimeout(select, 0);
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) select(); };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.removeEventListener("pageshow", onPageShow);
      if (pending) { pending.onload = null; pending.onerror = null; }
    };
  }, [pathname]);
  return <figure className="artwork-header">
    <div className="artwork-image" aria-hidden="true" style={artwork ? { backgroundImage: `url("${artwork.image}")` } : undefined} />
    <figcaption className="artwork-caption">{artwork ? <a href={artwork.source} target="_blank" rel="noopener noreferrer" aria-label={`${artworkCaption(artwork)} — explore on ${artwork.sourceLabel} (opens in a new tab)`}>{artworkCaption(artwork)}</a> : "Art collection · public domain"}</figcaption>
  </figure>;
}
