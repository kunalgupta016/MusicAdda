export default function UserList({ users, clientId, isHost, onTransferControl }) {
  return (
    <ul className="space-y-2">
      {users.map((user) => (
        <li
          key={user.clientId}
          className="board-frame-sm flex flex-wrap items-center gap-2 rounded-lg bg-tapri-paper p-2"
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-tapri-brown bg-tapri-mustard font-heading text-sm font-semibold text-tapri-brown">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <span className="min-w-[60px] flex-1 truncate text-sm text-tapri-brown">
            {user.name}
            {user.clientId === clientId && " (you)"}
          </span>
          {user.isHost && (
            <span className="flex-shrink-0 rounded-full bg-tapri-terracotta/15 px-2 py-0.5 text-xs text-tapri-terracotta-dark">
              ☕ Host
            </span>
          )}
          {isHost && !user.isHost && (
            <button
              onClick={() => onTransferControl(user.clientId)}
              className="tapri-btn flex-shrink-0 rounded-full bg-tapri-cream px-2 py-0.5 text-xs text-tapri-brown hover:bg-tapri-mustard/40"
            >
              Make host
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
