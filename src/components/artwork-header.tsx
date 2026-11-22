"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { nextArtwork, type Artwork } from "@/ui/artwork";

export function ArtworkHeader() {
  const pathname = usePathname();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  useEffect(() => {
    let disposed = false;
    let pending: HTMLImageElement | null = null;
    function select() {
      if (pending) { pending.onload = null; pending.onerror = null; }
      let storage: Storage | undefined;
      try { storage = window.sessionStorage; } catch { /* Private browsing can deny storage. */ }
      const next = nextArtwork(storage);
      const image = new Image();
      pending = image;
      image.onload = () => { if (!disposed) setArtwork(next); };
      image.onerror = () => { if (!disposed) setArtwork(null); };
      image.src = next.image;
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
    <figcaption className="artwork-caption">{artwork ? <a href={artwork.source} target="_blank" rel="noopener noreferrer" aria-label={`${artwork.artist}, ${artwork.title}, ${artwork.year} — artwork reference (opens in a new tab)`}>{artwork.artist} · {artwork.title}, {artwork.year}</a> : "Art collection · public domain"}</figcaption>
  </figure>;
}
