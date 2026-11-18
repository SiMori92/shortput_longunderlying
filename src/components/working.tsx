"use client";
import { Info } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
const subscribe = () => () => {};
/** Native keyboard disclosure, positioned within the viewport on small screens. */
export function Working({ label, formula, inputs }: { label: string; formula: string; inputs: string }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const host = useRef<HTMLDetailsElement>(null), content = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [style, setStyle] = useState<CSSProperties>({});
  useEffect(() => {
    if (!open) return;
    function place() {
      const anchor = host.current?.getBoundingClientRect(), panel = content.current;
      if (!anchor || !panel) return;
      const width = Math.min(300, window.innerWidth - 32), height = Math.min(panel.scrollHeight, window.innerHeight - 32);
      setStyle({ position: "fixed", width, maxWidth: width, maxHeight: window.innerHeight - 32, overflowY: "auto", left: Math.max(16, Math.min(anchor.right - width, window.innerWidth - width - 16)), right: "auto", bottom: "auto", top: Math.max(16, Math.min(anchor.top >= height + 24 ? anchor.top - height - 8 : anchor.bottom + 8, window.innerHeight - height - 16)), zIndex: 60 });
    }
    function close(event: Event) { if (event instanceof KeyboardEvent ? event.key === "Escape" : !host.current?.contains(event.target as Node)) host.current?.removeAttribute("open"); }
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", close);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return <details ref={host} className="working" data-ready={ready} inert={!ready} onKeyDown={e => { if (e.key === "Escape") host.current?.removeAttribute("open"); }} onToggle={e => setOpen(e.currentTarget.open)}><summary aria-label={`Show working: ${label}`}><Info size={15} aria-hidden="true" /></summary><div ref={content} className="working-content" style={style}><strong>{label}</strong><code>{formula}</code><span>{inputs}</span></div></details>;
}
