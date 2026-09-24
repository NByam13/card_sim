import { CardBacks } from '../context';
import { CardInstance } from '../types';

/**
 * What fills a card's frame, and which art a face-down card shows.
 *
 * Ported from the `CardFace` half of PonyRec's `PlaytestCard.tsx`, split into
 * its own file because three things render it: the interactive card, the drag
 * overlay, and (later) the opponent's mirror. A rotated back has to look
 * identical in all of them.
 */

/** Base on-board card width in px (portrait). */
export const BASE_WIDTH = 90;
/** The rotated card's long edge: BASE_WIDTH * 88/63. */
export const BASE_WIDTH_LANDSCAPE = 126;

/**
 * The art for a face-down card. A card with unique back art (Ruby Rare Main
 * Characters, the BP02 story backs) carries its own; everything else uses the
 * shared scene or generic back from the deck snapshot.
 *
 * Returns null when the snapshot predates `card_backs`
 * (NByam13/kayou_structured#170), which draws an empty frame rather than
 * guessing at a URL — this app constructs no image URLs, because the art lives
 * in a bucket that can move.
 */
export function cardBack(instance: CardInstance, backs: CardBacks | null): string | null {
  if (instance.card.card_back_url) {
    return instance.card.card_back_url;
  }

  if (!backs) {
    return null;
  }

  return instance.card.subtype === 'scene' ? backs.scene : backs.generic;
}

/**
 * Whether a card's face-down art is landscape. Story cards are the only ones
 * with landscape back art (the BP02 story backs); every other back — generic,
 * scene, and the RR Main Character backs — is portrait. `CardFace` rotates the
 * back only when its orientation and the frame's disagree.
 */
export function backIsLandscape(
  card: { subtype?: string | null; card_back_url?: string | null } | null | undefined
): boolean {
  return !!card?.card_back_url && card.subtype === 'story';
}

/**
 * The image (or name fallback) that fills a card's frame.
 *
 * A face-down Plan lies in a HORIZONTAL slot, but the card-back art is portrait.
 * `object-cover` would just crop it, so instead the image is sized to the slot's
 * transpose (a portrait box) and rotated 90° — it then lands exactly in the
 * landscape frame with no crop, so the back reads sideways like a real Plan
 * placed face down. Every other card fills its frame normally.
 */
export default function CardFace({
  src,
  name,
  faceDown,
  landscape,
  width,
  backLandscape = false,
  pulse = false,
}: {
  src: string | null;
  name: string;
  faceDown: boolean;
  landscape: boolean;
  /** The rendered card width in px — drives the rotated back's exact sizing. */
  width: number;
  /** The face-down art is landscape (story backs) — see `backIsLandscape`. */
  backLandscape?: boolean;
  /** Pulse the name fallback while the card is still hydrating. */
  pulse?: boolean;
}) {
  if (!src) {
    return (
      <span
        className={`flex h-full w-full items-center justify-center p-1 text-center text-[9px] leading-tight ${
          pulse ? 'animate-pulse text-gray-500' : 'text-gray-600'
        }`}
      >
        {name}
      </span>
    );
  }

  // A face-down card rotates its back only when the art's orientation and the
  // frame's disagree: portrait art in a landscape slot (a Plan's generic back)
  // or landscape art in a portrait slot (a story back outside a story zone).
  // Size the image to the frame's transpose and rotate 90° so it fits with no
  // crop. Needs the parent to be `relative` (each caller's frame is).
  if (faceDown && landscape !== backLandscape) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        style={
          landscape
            ? { width: (width * 63) / 88, height: width } // frame w × w·63/88
            : { width: (width * 88) / 63, height: width } // frame w × w·88/63
        }
        className="absolute top-1/2 left-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 rotate-90 object-cover"
      />
    );
  }

  return (
    <img
      src={src}
      alt={faceDown ? '' : name}
      className="h-full w-full object-cover"
      draggable={false}
    />
  );
}
