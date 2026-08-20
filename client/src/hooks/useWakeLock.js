import { useEffect, useRef } from "react";

// Keeps the screen from auto-dimming/locking from inactivity while a track
// is actively playing and the tab is visible. This does NOT keep playback
// alive once the user manually locks the screen or switches apps — the Wake
// Lock spec force-releases the lock the instant the tab becomes hidden, and
// no web API can override that. It only stops the *idle-timeout* screen
// lock from kicking in while someone's actively got the app open.
export function useWakeLock(shouldHold) {
  const lockRef = useRef(null);

  useEffect(() => {
    if (!("wakeLock" in navigator) || !shouldHold) return;
    let cancelled = false;

    async function acquire() {
      try {
        lockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Permission denied, unsupported in this context, or tab not
        // visible yet — nothing actionable to do about it here.
      }
    }

    acquire();

    // The lock is auto-released whenever the tab is hidden, so re-request
    // it as soon as the tab becomes visible again (still playing).
    function handleVisibility() {
      if (!cancelled && document.visibilityState === "visible" && !lockRef.current) {
        acquire();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      lockRef.current?.release?.();
      lockRef.current = null;
    };
  }, [shouldHold]);
}
