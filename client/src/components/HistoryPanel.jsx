import { formatRelativeTime } from "../lib/time";

export default function HistoryPanel({ history, isHost, onReplayNow, onQueue }) {
  if (history.length === 0) {
    return <p className="font-chalk text-sm text-tapri-brown-light">Nothing's been played yet.</p>;
  }

  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto">
      {history.map((item) => (
        <li
          key={`${item.itemId}-${item.playedAt}`}
          className="board-frame-sm flex flex-wrap items-center gap-3 rounded-lg bg-tapri-paper p-2"
        >
          <img src={item.thumbnail} alt="" className="h-10 w-10 flex-shrink-0 rounded object-cover" />
          <div className="min-w-[100px] flex-1">
            <p className="truncate text-sm text-tapri-brown">{item.title}</p>
            <p className="truncate text-xs text-tapri-brown-light">{formatRelativeTime(item.playedAt)}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            {isHost && (
              <button
                onClick={() => onReplayNow(item.itemId)}
                title="Play this right now"
                className="tapri-btn rounded-full bg-tapri-terracotta px-2 py-1 text-xs text-tapri-cream hover:bg-tapri-terracotta-dark"
              >
                ▶ Replay
              </button>
            )}
            <button
              onClick={() => onQueue(item.itemId)}
              title="Add back to the queue"
              className="tapri-btn rounded-full bg-tapri-cream px-2 py-1 text-xs text-tapri-brown hover:bg-tapri-mustard/30"
            >
              + Queue
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
