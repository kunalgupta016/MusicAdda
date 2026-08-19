import { useEffect, useState } from "react";
import { socket } from "../lib/socket";

// Purely visual — listens for the server's broadcast relay and spawns a
// floating emoji per reaction. No local state is shared with playback or
// room state; each emoji just animates itself out and removes itself.
export default function ReactionOverlay() {
  const [floats, setFloats] = useState([]);

  useEffect(() => {
    function handleReaction({ emoji }) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const left = 10 + Math.random() * 75; // percent across the width
      const drift = Math.round((Math.random() - 0.5) * 60); // px sideways wobble

      setFloats((prev) => [...prev, { id, emoji, left, drift }]);
      setTimeout(() => {
        setFloats((prev) => prev.filter((f) => f.id !== id));
      }, 2200);
    }

    socket.on("reaction", handleReaction);
    return () => socket.off("reaction", handleReaction);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
      {floats.map((f) => (
        <span
          key={f.id}
          className="floating-emoji absolute bottom-2 text-3xl"
          style={{ left: `${f.left}%`, "--drift": `${f.drift}px` }}
        >
          {f.emoji}
        </span>
      ))}
    </div>
  );
}
