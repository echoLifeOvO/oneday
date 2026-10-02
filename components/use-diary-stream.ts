"use client";
import { useEffect, useState } from "react";
import { ApiError, getStream } from "@/lib/diary-api";
import { registerPlace } from "@/lib/catalog";
import { STREAM_INTERVAL } from "@/lib/limits";
import { startPoller } from "@/lib/poller";
import type { StreamDiary } from "@/lib/types";
export function useDiaryStream(enabled: boolean, revision: number) {
  const [diaries, setDiaries] = useState<StreamDiary[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let signature = "", errors = 0;
    const poller = startPoller(async signal => {
      if (document.hidden) return;
      try {
        const result = await getStream(signal);
        if (signal.aborted) return;
        errors = 0;
        const next = JSON.stringify(result.diaries);
        if (next !== signature) {
          result.diaries.forEach(d => registerPlace(d.place, false));
          signature = next; setDiaries(result.diaries);
        }
      } catch (error) {
        if (signal.aborted) return;
        errors++;
        return error instanceof ApiError && error.status === 429 ? Math.max(STREAM_INTERVAL, error.retryAfter * 1000)
          : Math.min(60000, STREAM_INTERVAL * 2 ** Math.min(errors, 4));
      }
    }, STREAM_INTERVAL);
    const visibility = () => { if (document.hidden) poller.pause(); else poller.resume(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { poller.stop(); document.removeEventListener("visibilitychange", visibility); };
  }, [enabled, revision]);
  return diaries;
}
