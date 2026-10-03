"use client";
import { useLayoutEffect, useRef, type RefObject } from "react";

// Safari may pan the document as well as resizing its visual viewport when an
// input gets focus. The modal owns that outer viewport; only its list and text
// field may scroll. Keep the list's reading position during keyboard expansion.
export function useReplyViewport(active: boolean, list: RefObject<HTMLDivElement | null>, input: RefObject<HTMLTextAreaElement | null>) {
  const position = useRef(0);
  const preserving = useRef(false);
  useLayoutEffect(() => {
    if (!active) return;
    const root = document.documentElement, viewport = window.visualViewport;
    const field = input.current, scroller = list.current;
    const previous = root.getAttribute("data-reply-open");
    root.dataset.replyOpen = "true";
    let frame = 0, settle = 0;
    function finishAfter(delay: number) {
      window.clearTimeout(settle);
      settle = window.setTimeout(() => { preserving.current = false; }, delay);
    }
    function update() {
      frame = 0;
      if (document.activeElement !== field) return;
      if (window.scrollX || window.scrollY) window.scrollTo({ left: 0, top: 0, behavior: "instant" });
      if (preserving.current && scroller) scroller.scrollTop = position.current;
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    function focus() {
      position.current = scroller?.scrollTop ?? 0;
      preserving.current = true;
      finishAfter(800); schedule();
    }
    function resize() {
      if (preserving.current) finishAfter(200);
      schedule();
    }
    function scroll() { if (!preserving.current && scroller) position.current = scroller.scrollTop; }
    function blur() { preserving.current = false; window.clearTimeout(settle); }
    field?.addEventListener("focus", focus);
    field?.addEventListener("blur", blur);
    scroller?.addEventListener("scroll", scroll, { passive: true });
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame); window.clearTimeout(settle); preserving.current = false;
      field?.removeEventListener("focus", focus); field?.removeEventListener("blur", blur);
      scroller?.removeEventListener("scroll", scroll);
      viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule);
      if (previous === null) root.removeAttribute("data-reply-open"); else root.setAttribute("data-reply-open", previous);
    };
  }, [active, input, list]);
  return () => {
    preserving.current = false; position.current = 0;
    if (list.current) list.current.scrollTop = 0;
  };
}
