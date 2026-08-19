import { useEffect, useState } from "react";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function NowPlayingBar({ currentTrack, playbackState, duration, isHost, muted, onPlay, onPause, onSeekCommit, onNext, onToggleMute }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const [scrubValue, setScrubValue] = useState(null);

  if (!currentTrack) {
    return (
      <div className="chalkboard rounded-xl p-6 text-center">
        <p className="font-chalk text-lg text-tapri-chalk/90">Nothing's playing yet…</p>
        <p className="mt-1 text-sm text-tapri-chalk/50">
          Paste a link below to get the music going.
        </p>
      </div>
    );
  }

  const { isPlaying, timestamp, updatedAt } = playbackState;
  const elapsed = isPlaying ? timestamp + (now - updatedAt) / 1000 : timestamp;
  const displayValue = scrubValue ?? Math.min(elapsed, duration || elapsed);

  return (
    <div className="chalkboard rounded-xl p-4">
      <p className="font-chalk mb-2 text-xs tracking-wide text-tapri-mustard">✷ Now Playing ✷</p>
      <div className="flex items-center gap-4">
        <img
          src={currentTrack.thumbnail}
          alt=""
          className="h-16 w-16 flex-shrink-0 rounded-lg border-2 border-tapri-chalk/20 object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="chalk-text truncate text-lg text-tapri-chalk">{currentTrack.title}</p>
          <p className="truncate text-sm text-tapri-chalk/50">Added by {currentTrack.addedBy}</p>
        </div>

        <div className="flex items-center gap-2">
          {isHost ? (
            <>
              <button
                onClick={isPlaying ? onPause : onPlay}
                className="tapri-btn rounded-full bg-tapri-terracotta px-4 py-2 text-sm font-semibold text-tapri-cream hover:bg-tapri-terracotta-dark"
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button
                onClick={onNext}
                className="tapri-btn rounded-full bg-tapri-mustard px-4 py-2 text-sm font-semibold text-tapri-brown hover:bg-tapri-mustard-dark"
              >
                Skip
              </button>
            </>
          ) : (
            <span className="rounded-full border border-tapri-chalk/25 px-3 py-1 text-xs text-tapri-chalk/70">
              {isPlaying ? "▶ playing" : "⏸ paused"} · synced
            </span>
          )}
          <button
            onClick={onToggleMute}
            title={muted ? "Unmute (just for you)" : "Mute (just for you)"}
            className="tapri-btn rounded-full bg-tapri-cream px-3 py-2 text-sm text-tapri-brown hover:bg-tapri-mustard/30"
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-tapri-chalk/50">
        <span className="w-10 text-right">{formatTime(displayValue)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.5}
          value={displayValue || 0}
          disabled={!isHost || !duration}
          onChange={(e) => setScrubValue(Number(e.target.value))}
          onMouseUp={(e) => {
            const value = Number(e.target.value);
            setScrubValue(null);
            onSeekCommit?.(value);
          }}
          onTouchEnd={(e) => {
            const value = Number(e.target.value);
            setScrubValue(null);
            onSeekCommit?.(value);
          }}
          className="h-1 flex-1 cursor-pointer accent-tapri-mustard disabled:cursor-default"
        />
        <span className="w-10">{formatTime(duration)}</span>
      </div>
    </div>
  );
}
