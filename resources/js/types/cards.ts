/**
 * The card data this app knows about — which is exactly what PonyRec's deck
 * endpoint returns, and deliberately nothing more.
 *
 * PonyRec owns the catalogue. Its own `Card` model carries rarity axes, keywords,
 * effects, tags and a printed-text pipeline; none of that crosses the seam, and
 * adding a field here that the endpoint does not send would be this app starting
 * to hold card knowledge it has no way to keep true.
 *
 * Contract: PonyRec's documentation/deck-lookup-api/api.md.
 */

/**
 * An art variant marker. `label` is the printing's distinguishing name ('day',
 * 'night'); a base printing has no variant at all.
 */
export interface CardVariant {
  kind: string;
  label: string;
}

export interface Card {
  /**
   * The card's identity. Unique per printing — art variants carry their own
   * (`…D` / `…N`) and a shining printing leads with `※`.
   *
   * There is deliberately no `id`: PonyRec's primary keys are not part of the
   * contract and must not become a dependency.
   */
  card_number: string;
  name: string;
  subtype: 'character' | 'event' | 'item' | 'scene' | 'story' | 'main-character' | 'token';
  /** Rarity code (`C`, `CR`, `※ER`, `RR`, `TK` …). The ※ marks a shining printing. */
  rarity: string;
  set_code: string;
  /** Null where the subtype has none. */
  harmony_cost: number | null;
  /** Characters only. */
  inspiration: number | null;
  /** `I`–`IV` on Story cards, null elsewhere. */
  story_stage: string | null;
  /**
   * Opaque absolute URLs, served from a bucket on a different host from the API.
   * The host can change, the file names do not follow `card_number`, and a
   * cache-busting query string may be appended — so these are used exactly as
   * returned. Never derive one. Null when the card has no art.
   */
  image_url: string | null;
  thumb_url: string | null;
  /** Unique back art (Ruby Rare Main Characters), or null for the shared back. */
  card_back_url: string | null;
  release_status: 'released' | 'upcoming' | 'chinese-exclusive';
  variant: CardVariant | null;
}

/** One (card, zone) entry of a deck. A card in two zones appears twice. */
export interface DeckEntry {
  zone: 'main' | 'scene' | 'story' | 'sideboard';
  /** Copies of this card in this zone. An integer >= 1. */
  quantity: number;
  card: Card;
}

/**
 * A deck as it was imported, stored on the game row at seat-claim time. This is a
 * snapshot, not a live read: the deck may since have been renamed, edited or made
 * private on PonyRec, and the game is played from this regardless.
 */
export interface Deck {
  code: string;
  name: string;
  /** Null when the deck has no Main Character set. The board copes; see the deal. */
  main_character: Card | null;
  cards: DeckEntry[];
  /**
   * The token cards this deck's printed text references, resolved by PonyRec.
   * The board never reasons about which tokens exist or whether their set has
   * been released. Empty for a deck that references none.
   */
  tokens: Card[];
}
