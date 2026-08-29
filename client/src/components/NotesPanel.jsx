import { useState } from "react";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function NotesPanel({ roomId, clientId, notes, isHost }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("That PDF is over 10 MB — try a smaller file.");
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientId", clientId);
      const res = await fetch(`${SERVER_URL}/api/rooms/${roomId}/notes`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(noteId) {
    try {
      await fetch(`${SERVER_URL}/api/rooms/${roomId}/notes/${noteId}?clientId=${encodeURIComponent(clientId)}`, {
        method: "DELETE",
      });
    } catch {
      // sync-state broadcast will reflect the true state either way
    }
  }

  return (
    <div className="space-y-2">
      <label className="tapri-btn block cursor-pointer rounded-lg bg-tapri-mustard px-4 py-2 text-center font-heading text-sm font-semibold text-tapri-brown hover:bg-tapri-mustard-dark">
        {uploading ? "Uploading…" : "+ Share a PDF"}
        <input type="file" accept="application/pdf" onChange={handleFileChange} disabled={uploading} className="hidden" />
      </label>
      {error && <p className="text-xs text-tapri-red">{error}</p>}

      {notes.length === 0 ? (
        <p className="font-chalk text-sm text-tapri-brown-light">No notes shared yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => {
            const canDelete = isHost || note.uploadedByClientId === clientId;
            return (
              <li
                key={note.noteId}
                className="board-frame-sm flex flex-wrap items-center gap-2 rounded-lg bg-tapri-paper p-2"
              >
                <span className="text-xl">📄</span>
                <div className="min-w-[120px] flex-1">
                  <p className="truncate text-sm text-tapri-brown">{note.filename}</p>
                  <p className="truncate text-xs text-tapri-brown-light">
                    {note.uploadedBy} · {formatSize(note.sizeBytes)}
                  </p>
                </div>
                <a
                  href={`${SERVER_URL}/api/rooms/${roomId}/notes/${note.noteId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tapri-btn flex-shrink-0 rounded-full bg-tapri-cream px-3 py-1 text-xs font-heading font-semibold text-tapri-brown hover:bg-tapri-mustard/30"
                >
                  View
                </a>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(note.noteId)}
                    className="flex-shrink-0 rounded px-2 py-1 text-xs text-tapri-brown-light hover:bg-tapri-brown/10 hover:text-tapri-red transition"
                    title="Remove"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
