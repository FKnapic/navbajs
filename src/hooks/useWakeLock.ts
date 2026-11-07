import { useEffect } from "react"

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request("screen")
      } catch {
        /* preglednik može odbiti zaključavanje, navigacija i dalje radi */
      }
    }
    void request()
    const onVisible = () => {
      if (!cancelled && document.visibilityState === "visible") void request()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisible)
      void lock?.release()
    }
  }, [active])
}
