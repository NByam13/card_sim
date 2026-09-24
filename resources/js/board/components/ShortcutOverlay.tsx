import { SHORTCUTS } from '../shortcuts';
import { useEffect } from 'react';

/**
 * The `?` cheat sheet — a floating panel listing every binding, grouped by
 * whether it acts on a card or the board. Rendered from the shared SHORTCUTS
 * table, so a new binding shows up here without touching this file.
 */
export default function ShortcutOverlay({ onClose }: { onClose: () => void }) {
  const cardKeys = SHORTCUTS.filter((s) => s.scope === 'card');
  const boardKeys = SHORTCUTS.filter((s) => s.scope === 'board');

  // The list itself advertises "Esc — Close menu or dialog", so honour it here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const row = (key: string, label: string) => (
    <div key={key} className="flex items-center justify-between gap-6 py-0.5">
      <span className="text-gray-600">{label}</span>
      <kbd className="shrink-0 rounded border border-gray-300 bg-gray-50 px-1.5 font-mono text-[11px] font-semibold text-gray-500">
        {key}
      </kbd>
    </div>
  );

  return (
    <div className="fixed bottom-4 left-4 z-50 w-72 rounded-xl border border-gray-200 bg-white/95 p-4 text-xs shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-gray-900">Shortcuts</h3>
        <button
          onClick={onClose}
          className="text-gray-400 transition hover:text-gray-700"
          aria-label="Close shortcuts"
        >
          ✕
        </button>
      </div>

      <p className="mb-2 leading-snug text-gray-400">
        Card actions apply to the card under your cursor, or the one whose menu is open.
      </p>
      <p className="mb-2 leading-snug text-gray-400">
        Drag a box over empty board to select several at once. A card action then hits all of them.
        Shift-drag adds to the selection, ⌘/Ctrl-click toggles one card.
      </p>

      <div className="space-y-0.5 border-t border-gray-100 pt-2">
        {cardKeys.map((s) => row(s.key, s.label))}
      </div>
      <div className="mt-2 space-y-0.5 border-t border-gray-100 pt-2">
        {boardKeys.map((s) => row(s.key, s.label))}
      </div>
    </div>
  );
}
