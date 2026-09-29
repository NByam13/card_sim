import Modal from '@/components/Modal';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useBoardCardBacks } from '../context';
import { CardInstance } from '../types';
import { HoverPreview } from './BoardCard';
import CardFace, { BASE_WIDTH, backIsLandscape, cardBack } from './CardFace';

/** How long the pointer must rest on a row before its preview pops, matching the board. */
const HOVER_DWELL_MS = 500;

/** How much of the mirror's card size the peek uses — small, but readable. */
const PEEK_SCALE = 0.45;

/**
 * The opponent's Retire pile: the top card and a count, opening a read-only list.
 *
 * Retire is a public zone, so its contents are already on the wire. Drawn small
 * because it sits in the mirror's strip and must not cost the table height, and
 * clickable everywhere because looking through it is the only thing it is for.
 *
 * Nothing here acts. The board's own viewer can tutor a card out of Retire; this
 * one cannot, because every action on a mirror would be an action on a board this
 * browser does not own.
 *
 * @see documentation/board-sync/spec.md
 */
export default function MirrorRetire({ cards, scale }: { cards: CardInstance[]; scale: number }) {
  const [open, setOpen] = useState(false);
  // Newest on top, as the pile reads on the board.
  const top = cards.at(-1);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Their Retire pile (${cards.length}) — click to look through it`}
        aria-label={`View their Retire pile (${cards.length} cards)`}
        className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 transition hover:bg-gray-100"
      >
        <span className="text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
          Retire {cards.length}
        </span>
        {top && <PeekCard instance={top} scale={scale} />}
      </button>

      {open && <MirrorRetireModal cards={cards} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The top of the pile, at peek size. */
function PeekCard({ instance, scale }: { instance: CardInstance; scale: number }) {
  const backs = useBoardCardBacks();
  const width = BASE_WIDTH * scale * PEEK_SCALE;
  const src = instance.faceDown
    ? cardBack(instance, backs)
    : (instance.card.thumb_url ?? instance.card.image_url);

  return (
    <div
      style={{ width, aspectRatio: '63 / 88' }}
      className="relative shrink-0 overflow-hidden rounded bg-gray-200 ring-1 ring-black/10"
    >
      <CardFace
        src={src}
        // CardFace falls back to the name when it has no image, and a deck whose
        // snapshot predates `card_backs` has no back to draw. Never the name of
        // a card this side is not allowed to know.
        name={instance.faceDown ? '' : instance.card.name}
        faceDown={instance.faceDown}
        landscape={false}
        width={width}
        backLandscape={backIsLandscape(instance.card)}
      />
    </div>
  );
}

/**
 * Their pile as a searchable list.
 *
 * A row takes the same hover preview every other public card on the table takes,
 * so reading a retired card costs no click.
 */
function MirrorRetireModal({ cards, onClose }: { cards: CardInstance[]; onClose: () => void }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? cards.filter((c) => !c.faceDown && c.card.name.toLowerCase().includes(q)) : cards;
  }, [cards, query]);

  return (
    <Modal show onClose={onClose} maxWidth="lg">
      <div className="bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-gray-900">
            Their Retire <span className="text-sm font-normal text-gray-400">({cards.length})</span>
          </h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700">
            Close
          </button>
        </div>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search their retire by name…"
          className="mb-3 w-full rounded-lg border-gray-300 text-sm focus:border-accent-500 focus:ring-accent-500"
        />

        <div className="max-h-[55vh] space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">
              {cards.length === 0 ? 'Their Retire pile is empty.' : 'No matching cards.'}
            </p>
          )}
          {filtered.map((instance) => (
            <RetireRow key={instance.uid} instance={instance} />
          ))}
        </div>
      </div>
    </Modal>
  );
}

/**
 * One card in their pile.
 *
 * A card retired face down has no identity to show: redaction stripped it on the
 * way out, and this side never learns what it was.
 */
function RetireRow({ instance }: { instance: CardInstance }) {
  const [preview, setPreview] = useState(false);
  const dwell = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const known = !instance.faceDown;

  const startHover = () => {
    if (!known) return;
    clearTimeout(dwell.current);
    dwell.current = setTimeout(() => setPreview(true), HOVER_DWELL_MS);
  };

  const endHover = () => {
    clearTimeout(dwell.current);
    setPreview(false);
  };

  // Their pile grows while you are reading it, so a row can unmount with the
  // pointer still on it and never see a mouseleave.
  useEffect(() => () => clearTimeout(dwell.current), []);

  return (
    <div
      onMouseEnter={startHover}
      onMouseLeave={endHover}
      className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left"
    >
      <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-gray-200">
        {known && instance.card.thumb_url && (
          <img src={instance.card.thumb_url} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-800">
          {known ? instance.card.name : 'Face-down card'}
        </p>
        <p className="text-xs text-gray-400 capitalize">
          {known ? (instance.card.subtype ?? 'card') : 'hidden'}
        </p>
      </div>
      {preview && known && <HoverPreview card={instance.card} />}
    </div>
  );
}
