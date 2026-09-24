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
  /**
   * The card's identity *across* printings: the shining ※ marker, the Day/Night
   * art variants and the alt-art promos all collapse onto one key. This is the
   * grouping the 4-copy deck limit uses, so it is also what answers "is this
   * pile all the same card?".
   *
   * Optional only until PonyRec ships it (NByam13/kayou_structured#170). It
   * cannot be derived from the rest of this shape — see `copyKey` in
   * `board/mlp.ts`, which falls back to an approximation while it is absent.
   */
  copy_key?: string;
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
   * The card's printed rules text, composed by PonyRec into one string whatever
   * the subtype — a Character's abilities are rows in a table over there, an
   * Event's is a column, and none of that crosses the seam.
   *
   * A Character's abilities are separated by a blank line and each leads with
   * `[Appear]` or `[Activated · Cost: Tap · Adventure Zone]`; a Scene's Inspire
   * effect is labelled the same way. `{Mechanic}` braces mark printed banners and
   * are part of the text. Render it verbatim: the newlines are meaningful, and it
   * is plain text, never HTML.
   *
   * Null when the card prints no text (a Main Character). Optional only until
   * PonyRec ships it (NByam13/kayou_structured#170) — a snapshot taken before
   * then has no text to show.
   */
  card_text?: string | null;
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
  /**
   * The backs shared by every card without a unique one. A card's own
   * `card_back_url` wins where it is not null, which is only Ruby Rare Main
   * Characters and the BP02 story backs.
   *
   * Sent rather than built, because the art sits in a bucket that can move and
   * whose file names follow no pattern this app can see. Optional only until
   * PonyRec ships it (NByam13/kayou_structured#170); a snapshot without it
   * draws a blank back, which `cardBack` handles.
   */
  card_backs?: {
    scene: string;
    generic: string;
  };
}
