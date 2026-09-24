import { useCallback, useEffect, useRef, useState } from 'react';

export interface ZoneMenuItem {
  label: string;
  onClick: () => void;
  /**
   * The keyboard binding for this same action, drawn from the shared MENU_HINTS
   * table. Rendered as a chip, exactly as the card context menu does it, so a
   * pile's actions advertise their keys the same way a card's do.
   */
  hint?: string;
}

/**
 * A zone-header control that opens a small action menu (Shuffle / View / Draw).
 *
 * Ported from PonyRec's `ZoneMenu.tsx`; it renders whatever it is given.
 * Opens upward since these zones live in the bottom bar. When `label` is given,
 * the whole label+chevron is the clickable trigger (not just the chevron).
 *
 * Uncontrolled by default. Pass `open`/`onOpenChange` to drive it from a parent —
 * e.g. a DeckPile that opens this menu when the whole pile is right-clicked.
 */
export default function ZoneMenu({
  items,
  label,
  open: controlledOpen,
  onOpenChange,
}: {
  items: ZoneMenuItem[];
  label?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (value: boolean) => {
      onOpenChange?.(value);
      if (controlledOpen === undefined) setInternalOpen(value);
    },
    [controlledOpen, onOpenChange]
  );
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  return (
    <div ref={ref} className={`relative ${label ? 'w-full' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Zone actions"
        className={`flex items-center gap-1 rounded px-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 ${
          label ? 'w-full justify-between' : ''
        }`}
      >
        {label && <span className="truncate">{label}</span>}
        <span className="text-sm leading-none">▾</span>
      </button>
      {open && (
        // min-w is wide enough for the longest row plus its hint chip ("Top card
        // to Plan" + `p`), which the old 110px squeezed onto two lines.
        <div className="absolute bottom-full right-0 z-40 mb-1 min-w-[170px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => {
                it.onClick();
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-emerald-50"
            >
              <span className="whitespace-nowrap">{it.label}</span>
              {it.hint && (
                <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 font-mono text-[10px] font-semibold text-gray-400">
                  {it.hint}
                </kbd>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
