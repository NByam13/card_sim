import Modal from '@/components/Modal';
import { Card } from '@/types/cards';
import { Fragment } from 'react';

/**
 * One card, read properly: the art at a size you can actually read, and the few
 * facts that are printed on it.
 *
 * Deliberately not PonyRec's card page. That one carries play rates, archetype
 * profiles, keyword chips and its whole catalogue model, none of which help
 * somebody mid-game asking "what does this do again?". This shows the image, the
 * name, the cost, the Inspiration if the card has one, and the printed text.
 *
 * The text arrives composed by PonyRec as `card_text` — a Character's abilities
 * are rows in a table over there, and flattening them is the endpoint's job, not
 * this app's. See `Card.card_text`.
 */
export default function CardViewModal({ card, onClose }: { card: Card; onClose: () => void }) {
  // A story card is the same card rotated, so its frame is the flipped one.
  const landscape = card.subtype === 'story';

  return (
    <Modal show onClose={onClose} maxWidth="2xl" labelledBy="card-view-name">
      <div className="flex max-h-[85vh] flex-col gap-5 overflow-y-auto p-5 sm:flex-row">
        <div className="shrink-0 sm:w-72">
          {card.image_url ? (
            <img
              src={card.image_url}
              alt={card.name}
              style={{ aspectRatio: landscape ? '88 / 63' : '63 / 88' }}
              className="w-full rounded-lg object-cover shadow-md ring-1 ring-black/10"
            />
          ) : (
            /* No art is a real state — an upcoming card can be in a deck before
               its scan exists — and the text below is the point of this view
               anyway, so the frame stays rather than the layout jumping. */
            <div
              style={{ aspectRatio: landscape ? '88 / 63' : '63 / 88' }}
              className="flex w-full items-center justify-center rounded-lg bg-gray-100 p-4 text-center text-sm text-gray-500 ring-1 ring-black/10"
            >
              No art for this card
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id="card-view-name" className="text-xl font-semibold text-gray-900">
              {card.name}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 shrink-0 rounded p-1 text-2xl leading-none text-gray-400 hover:text-gray-700"
            >
              &times;
            </button>
          </div>

          {/* Only the two numbers a card prints. Both are null on the subtypes
              that have neither, and a zero cost is a real cost, so these test for
              null rather than falsiness. */}
          {(card.harmony_cost !== null || card.inspiration !== null) && (
            <dl className="flex gap-6">
              {card.harmony_cost !== null && <Stat label="Harmony" value={card.harmony_cost} />}
              {card.inspiration !== null && <Stat label="Inspiration" value={card.inspiration} />}
            </dl>
          )}

          <CardText card={card} />
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-gray-500 uppercase">{label}</dt>
      <dd className="text-lg font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

/**
 * The card's printed text.
 *
 * Three states, and they are not the same thing: text, a card that prints none
 * (a Main Character), and a deck snapshot taken before PonyRec sent the field at
 * all. The last one says so, because "this card has no text" would be a lie
 * about the card rather than about the snapshot.
 */
function CardText({ card }: { card: Card }) {
  if (card.card_text === undefined) {
    return (
      <p className="text-sm text-gray-500 italic">
        This deck was imported before card text was available. Re-import it to read the text here.
      </p>
    );
  }

  if (card.card_text === null) {
    return null;
  }

  // Abilities are separated by a blank line, in printed order.
  const abilities = card.card_text.split(/\n{2,}/).filter((block) => block.trim() !== '');

  return (
    <div className="space-y-3">
      {abilities.map((ability, index) => (
        <Ability key={index} text={ability} />
      ))}
    </div>
  );
}

/**
 * One printed ability: its bracketed lead, if it has one, then what it does.
 *
 * `card_text` leads an ability with `[Appear]` or
 * `[Activated · Cost: Tap · Adventure Zone]` — the trigger, then a cost, then a
 * zone gate. Lifting that out of the sentence is the whole reason to parse
 * anything here: those say *when* the ability fires, and buried in the prose
 * they read as part of it.
 */
function Ability({ text }: { text: string }) {
  const lead = text.match(/^\[([^\]]+)\]\s*(.*)$/s);

  return (
    <div className="space-y-1">
      {lead && (
        <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">{lead[1]}</p>
      )}
      <p className="text-sm leading-relaxed whitespace-pre-line text-gray-800">
        <Mechanics text={lead ? lead[2] : text} />
      </p>
    </div>
  );
}

/**
 * Card text with its `{Mechanic}` banners drawn as pills.
 *
 * PonyRec marks a printed mechanic — `{Leap}`, `{Revelation}` — in braces,
 * inline, wherever it appears. Rendering them literally would put stray braces
 * in front of the reader, so they are drawn the way they are printed: as a
 * highlighted banner.
 */
function Mechanics({ text }: { text: string }) {
  const segments = text.split(/(\{[^{}]+\})/g).filter(Boolean);

  return (
    <>
      {segments.map((segment, index) => {
        const mechanic = segment.match(/^\{([^{}]+)\}$/);

        return mechanic ? (
          <span
            key={index}
            className="mx-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 align-baseline text-xs font-semibold text-amber-800"
          >
            {mechanic[1]}
          </span>
        ) : (
          <Fragment key={index}>{segment}</Fragment>
        );
      })}
    </>
  );
}
