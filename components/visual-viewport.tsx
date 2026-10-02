"use client";
import { useEffect } from "react";

// Keep modal controls above mobile keyboards without resizing the paused globe.
export default function VisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport, root = document.documentElement;
    let frame = 0, restingHeight = window.innerHeight;
    function update() {
      frame = 0;
      const height = viewport?.height ?? window.innerHeight, top = viewport?.offsetTop ?? 0;
      root.style.setProperty("--visual-height", `${height}px`);
      root.style.setProperty("--visual-top", `${top}px`);
      const editing = !!document.activeElement?.matches("input,textarea");
      root.dataset.keyboard = String(editing && (window.innerHeight - height > 120 || restingHeight - height > 120));
      if (!editing) restingHeight = height;
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    update();
    viewport?.addEventListener("resize", schedule); viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule); document.addEventListener("focusin", schedule); document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame); viewport?.removeEventListener("resize", schedule); viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule); document.removeEventListener("focusin", schedule); document.removeEventListener("focusout", schedule);
      root.style.removeProperty("--visual-height"); root.style.removeProperty("--visual-top"); delete root.dataset.keyboard;
    };
  }, []);
  return null;
}
