const EMOJIS = ["❤️", "🔥", "😂", "👏", "☕"];

export default function ReactionPicker({ onReact }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className="board-frame-sm rounded-full bg-tapri-paper px-3 py-1 text-lg hover:bg-tapri-mustard/30 hover:scale-110 transition-transform"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
