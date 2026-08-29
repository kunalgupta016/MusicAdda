import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Seo from "../components/Seo";
import { getSiteUrl } from "../lib/site";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

export default function Home() {
  const navigate = useNavigate();
  const siteUrl = getSiteUrl();
  const [mode, setMode] = useState("music"); // "music" | "study"
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreateRoom() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomType: mode }),
      });
      if (!res.ok) throw new Error("Failed to create room");
      const { roomId } = await res.json();
      navigate(`/room/${roomId}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  function handleJoinRoom(e) {
    e.preventDefault();
    const code = joinCode.trim().toLowerCase();
    if (code) navigate(`/room/${code}`);
  }

  const isStudy = mode === "study";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Seo
        title="musicAdda | Listen to YouTube together in sync"
        description="Create a musicAdda room to listen to YouTube together in sync, or a study room to watch lecture videos and share notes together."
        schema={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "musicAdda",
              url: `${siteUrl}/`,
              logo: `${siteUrl}/favicon.png`,
            },
            {
              "@type": "WebSite",
              name: "musicAdda",
              url: `${siteUrl}/`,
              description: "Listen to YouTube together in sync, or study together with shared videos and notes.",
            },
          ],
        }}
      />
      <div className="bunting mb-4 w-full max-w-md">
        {Array.from({ length: 15 }).map((_, i) => (
          <span key={i} />
        ))}
      </div>

      <div className="board-frame w-full max-w-md rounded-2xl bg-tapri-paper px-8 py-10 -rotate-1">
        <p className="font-chalk text-sm tracking-wide text-tapri-terracotta-dark">
          your very own chai-tapri
        </p>
        <h1 className="mt-1 font-heading text-5xl font-bold text-tapri-brown">
          music<span className="text-tapri-terracotta">Adda</span>
          <span className="ml-2 inline-block rotate-6">☕</span>
        </h1>

        <p className="mx-auto mt-3 max-w-sm text-sm text-tapri-brown-light">
          Kya karna hai aaj?
        </p>

        <div className="mx-auto mt-3 grid max-w-xs grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("music")}
            className={`tapri-btn rounded-xl px-4 py-3 font-heading text-sm font-semibold ${
              mode === "music"
                ? "bg-tapri-terracotta text-tapri-cream"
                : "bg-tapri-cream text-tapri-brown hover:bg-tapri-mustard/30"
            }`}
          >
            🎵 Music sunni hai
          </button>
          <button
            type="button"
            onClick={() => setMode("study")}
            className={`tapri-btn rounded-xl px-4 py-3 font-heading text-sm font-semibold ${
              mode === "study"
                ? "bg-tapri-terracotta text-tapri-cream"
                : "bg-tapri-cream text-tapri-brown hover:bg-tapri-mustard/30"
            }`}
          >
            📚 Study karni hai
          </button>
        </div>

        <p className="mx-auto mt-4 max-w-sm text-sm text-tapri-brown-light">
          {isStudy
            ? "Ek room banao, lecture video dekho, aur PDFs/notes share karo — sab saath mein, apni apni speed se."
            : "Pull up a chair, share the link, and listen together — perfectly in sync, no login needed."}
        </p>

        <button
          onClick={handleCreateRoom}
          disabled={creating}
          className="tapri-btn mt-6 w-full rounded-xl bg-tapri-terracotta px-8 py-3 font-heading text-lg font-semibold text-tapri-cream hover:bg-tapri-terracotta-dark disabled:opacity-60"
        >
          {creating ? "Setting up your adda…" : isStudy ? "Start a Study Room" : "Start a Room"}
        </button>

        <div className="mt-6 flex items-center gap-3 text-tapri-brown-light">
          <div className="h-px flex-1 bg-tapri-brown/25" />
          <span className="font-heading text-xs uppercase tracking-widest">or</span>
          <div className="h-px flex-1 bg-tapri-brown/25" />
        </div>

        <form onSubmit={handleJoinRoom} className="mt-5 flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter room code"
            className="board-frame-sm flex-1 rounded-lg bg-tapri-cream px-3 py-2 text-center text-sm text-tapri-brown placeholder-tapri-brown-light/60 focus:outline-none"
          />
          <button
            type="submit"
            className="tapri-btn rounded-lg bg-tapri-mustard px-4 py-2 font-heading text-sm font-semibold text-tapri-brown hover:bg-tapri-mustard-dark"
          >
            Join
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-tapri-red">{error}</p>}
      </div>

      <p className="mt-6 font-chalk text-sm text-tapri-brown-light">
        no login, no hassle — just a name and good vibes ☕
      </p>
    </main>
  );
}
