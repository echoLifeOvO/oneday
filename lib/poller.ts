// One timer and at most one active request; errors can return a backoff interval.
export function startPoller(task: (signal: AbortSignal) => Promise<number | void>, interval: number) {
  let stopped = false, active = true, running = false, again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  async function tick() {
    if (stopped || !active) return;
    if (running) { again = true; return; }
    clearTimeout(timer); running = true;
    const current = new AbortController(); controller = current;
    let delay = interval;
    try { delay = (await task(current.signal)) ?? interval; }
    catch { delay = interval * 2; }
    finally {
      running = false;
      if (!stopped && active) { timer = setTimeout(tick, again ? 0 : Math.max(interval, delay)); again = false; }
    }
  }
  void tick();
  return {
    pause() { active = false; again = false; clearTimeout(timer); controller?.abort(); },
    resume() { if (stopped) return; active = true; void tick(); },
    stop() { stopped = true; active = false; clearTimeout(timer); controller?.abort(); },
  };
}
