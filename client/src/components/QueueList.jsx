export default function QueueList({ queue, clientId, onRemove, onVote }) {
  if (queue.length === 0) {
    return <p className="font-chalk text-sm text-tapri-brown-light">Queue's empty — quiet in here.</p>;
  }

  return (
    <ul className="space-y-2">
      {queue.map((item, i) => {
        const hasVoted = item.votes.includes(clientId);
        return (
          <li
            key={item.itemId}
            className="board-frame-sm flex items-center gap-3 rounded-lg bg-tapri-paper p-2"
          >
            <span className="w-5 flex-shrink-0 text-center font-heading text-xs text-tapri-brown-light">
              {i + 1}
            </span>
            <img src={item.thumbnail} alt="" className="h-10 w-10 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-tapri-brown">{item.title}</p>
              <p className="truncate text-xs text-tapri-brown-light">Added by {item.addedBy}</p>
            </div>
            <button
              onClick={() => onVote(item.itemId)}
              title={hasVoted ? "Remove your upvote" : "Upvote — most-voted plays next"}
              className={`tapri-btn flex-shrink-0 rounded-full px-2 py-1 text-xs font-heading font-semibold ${
                hasVoted
                  ? "bg-tapri-terracotta text-tapri-cream"
                  : "bg-tapri-cream text-tapri-brown hover:bg-tapri-mustard/30"
              }`}
            >
              ▲ {item.votes.length}
            </button>
            <button
              onClick={() => onRemove(item.itemId)}
              className="flex-shrink-0 rounded px-2 py-1 text-xs text-tapri-brown-light hover:bg-tapri-brown/10 hover:text-tapri-red transition"
              title="Remove"
            >
              ✕
            </button>
          </li>
        );
      })}
    </ul>
  );
}
