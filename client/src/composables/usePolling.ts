import { onUnmounted, ref } from "vue";

export function usePolling(fn: () => Promise<void>, intervalMs = 10000) {
  const active = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;

  function handleVisibility() {
    if (document.visibilityState === "hidden") {
      stop();
    } else if (active.value) {
      start();
    }
  }

  function start() {
    if (timer) return;
    document.addEventListener("visibilitychange", handleVisibility);
    fn(); // immediate first call
    timer = setInterval(() => {
      if (document.visibilityState !== "hidden") fn();
    }, intervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    document.removeEventListener("visibilitychange", handleVisibility);
  }

  onUnmounted(stop);

  return { start, stop, active };
}
