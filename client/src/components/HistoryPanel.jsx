import { formatRelativeTime } from "../lib/time";

export default function HistoryPanel({ history, onReplay }) {
  if (history.length === 0) {
    return <p className="font-chalk text-sm text-tapri-brown-light">Nothing's been played yet.</p>;
  }

  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto">
      {history.map((item) => (
        <li
          key={`${item.itemId}-${item.playedAt}`}
          className="board-frame-sm flex items-center gap-3 rounded-lg bg-tapri-paper p-2"
        >
          <img src={item.thumbnail} alt="" className="h-10 w-10 flex-shrink-0 rounded object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-tapri-brown">{item.title}</p>
            <p className="truncate text-xs text-tapri-brown-light">{formatRelativeTime(item.playedAt)}</p>
          </div>
          <button
            onClick={() => onReplay(item.itemId)}
            className="tapri-btn flex-shrink-0 rounded-full bg-tapri-cream px-2 py-1 text-xs text-tapri-brown hover:bg-tapri-mustard/30"
          >
            ↻ Replay
          </button>
        </li>
      ))}
    </ul>
  );
}
