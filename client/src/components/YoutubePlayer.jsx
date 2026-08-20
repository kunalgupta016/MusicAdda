import { useEffect, useRef } from "react";
import { loadYoutubeIframeApi } from "../lib/loadYoutubeIframeApi";

export default function YoutubePlayer({ onPlayerReady, onStateChange, onError }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    loadYoutubeIframeApi().then((YT) => {
      if (cancelled || !containerRef.current) return;
      playerRef.current = new YT.Player(containerRef.current, {
        height: "100%",
        width: "100%",
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => onPlayerReady?.(playerRef.current),
          onStateChange: (e) => onStateChange?.(e),
          onError: (e) => onError?.(e),
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-lg">
      <div ref={containerRef} />
    </div>
  );
}
