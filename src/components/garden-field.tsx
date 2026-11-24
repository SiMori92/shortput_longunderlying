"use client";
import { useEffect, useRef } from "react";
import { DEFAULT_PALETTE, paintGarden, type GardenMode, type GardenPalette } from "@/ui/garden-field";

function palette(el: Element): GardenPalette {
  const css = getComputedStyle(el), read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return { d1: read("--d1", DEFAULT_PALETTE.d1), d2: read("--d2", DEFAULT_PALETTE.d2), d3: read("--d3", DEFAULT_PALETTE.d3), d4: read("--d4", DEFAULT_PALETTE.d4) };
}

/**
 * Decorative painted field. The CSS underpaint shows until the canvas paints, so loading never shifts layout.
 * Repaints only when its size changes (not on polling or data refresh), with the same seed each time.
 */
export function GardenField({ mode, seed, className }: { mode: GardenMode; seed: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let size = "";
    function paint() {
      if (!el) return;
      const W = el.clientWidth, H = el.clientHeight;
      if (!W || !H || `${W}x${H}` === size) return;
      size = `${W}x${H}`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(W * dpr); el.height = Math.round(H * dpr);
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintGarden(ctx, W, H, mode, seed, palette(el));
      el.dataset.painted = "true";
    }
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode, seed]);
  return <canvas ref={canvas} className={`garden-field garden-${mode}${className ? ` ${className}` : ""}`} aria-hidden="true" data-seed={seed} />;
}
