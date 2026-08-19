import { useState } from "react";
import { extractYoutubeId } from "../lib/youtube";

export default function AddTrackForm({ onAdd }) {
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!extractYoutubeId(url)) {
      setError("That doesn't look like a valid YouTube link.");
      return;
    }

    setPending(true);
    const res = await onAdd(url);
    setPending(false);

    if (res?.ok) {
      setUrl("");
    } else {
      setError(res?.error || "Couldn't add that track, try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube link…"
          className="board-frame-sm flex-1 rounded-lg bg-tapri-cream px-3 py-2 text-sm text-tapri-brown placeholder-tapri-brown-light/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !url.trim()}
          className="tapri-btn flex-shrink-0 rounded-lg bg-tapri-terracotta px-4 py-2 text-sm font-heading font-semibold text-tapri-cream hover:bg-tapri-terracotta-dark disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-tapri-red">{error}</p>}
    </form>
  );
}
