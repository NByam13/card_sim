/**
 * The always-visible entry point to the keyboard-shortcut overlay.
 *
 * The overlay also toggles on `?`, but that binding is undiscoverable on its
 * own — you'd have to already know it exists — so the rail carries a labelled
 * button that shows the key alongside it.
 */
export default function ShortcutsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Keyboard shortcuts"
      className="flex w-32 items-center justify-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600 shadow-sm ring-1 ring-gray-300 transition hover:bg-gray-50"
    >
      <span>Shortcuts</span>
      <kbd className="rounded border border-gray-300 bg-gray-50 px-1 font-mono text-[10px] font-semibold text-gray-400">
        ?
      </kbd>
    </button>
  );
}
