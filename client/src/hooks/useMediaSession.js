import { useEffect } from "react";

// Wires up lock-screen / notification-shade media controls (Media Session
// API). This makes background playback *usable when the platform allows it
// to continue at all* — it does not by itself force playback to survive
// backgrounding. Android Chrome generally keeps audio alive through a
// screen lock or app switch once a tab has active media playing; iOS
// Safari does not — that's an iOS platform restriction, not something a
// web page can work around short of shipping a native app.
export function useMediaSession({ track, isPlaying, isHost, onPlay, onPause, onNext, onToggleMute }) {
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: `Added by ${track.addedBy} · musicAdda`,
      artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: "512x512", type: "image/jpeg" }] : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.trackId, track?.title, track?.addedBy, track?.thumbnail]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    // Host's lock-screen controls drive real room playback, same as their
    // in-app buttons. A listener has no playback authority, so theirs just
    // toggles their own local mute instead — the same split that already
    // exists in the in-app UI (only the host sees Play/Pause/Skip).
    navigator.mediaSession.setActionHandler("play", isHost ? onPlay : onToggleMute);
    navigator.mediaSession.setActionHandler("pause", isHost ? onPause : onToggleMute);
    navigator.mediaSession.setActionHandler("nexttrack", isHost ? onNext : null);
    navigator.mediaSession.setActionHandler("previoustrack", null);

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
    };
  }, [isHost, onPlay, onPause, onNext, onToggleMute]);
}
