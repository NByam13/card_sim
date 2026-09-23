import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from '@/types/cards';
import { CardInstance } from '../types';
import CardFace, { backIsLandscape, cardBack } from './CardFace';

/** Ported from PonyRec's `CardFace.test.tsx`, plus the back-art resolution. */
const img = (c: HTMLElement) => c.querySelector('img');

describe('CardFace', () => {
  it('rotates the back art of a face-down card in a landscape slot', () => {
    // A face-down Plan lies in a horizontal slot; its portrait back must be
    // rotated to fill the frame rather than cropped.
    const { container } = render(
      <CardFace src="/backs/generic.webp" name="Plan" faceDown landscape width={126} />
    );
    const el = img(container)!;

    expect(el.className).toContain('rotate-90');
    // Sized to the frame's transpose: portrait box that lands square once turned.
    expect(el.style.height).toBe('126px');
    expect(el.style.width).toBe(`${(126 * 63) / 88}px`);
  });

  it('does not rotate a face-down card in a portrait slot', () => {
    const { container } = render(
      <CardFace src="/backs/generic.webp" name="Card" faceDown landscape={false} width={90} />
    );
    expect(img(container)!.className).not.toContain('rotate-90');
  });

  it('does not rotate a landscape back in a landscape slot', () => {
    // A face-down Story card on its stage shows its own landscape back art
    // (the BP02 story backs) — rotating it would render it portrait.
    const { container } = render(
      <CardFace
        src="/backs/BP02-C-025.webp"
        name="Story"
        faceDown
        landscape
        backLandscape
        width={126}
      />
    );
    expect(img(container)!.className).not.toContain('rotate-90');
  });

  it('rotates a landscape back in a portrait slot', () => {
    // The inverse mismatch: a story back shown in a portrait frame must be
    // turned to fit, sized to the frame's transpose.
    const { container } = render(
      <CardFace
        src="/backs/BP02-C-025.webp"
        name="Story"
        faceDown
        landscape={false}
        backLandscape
        width={90}
      />
    );
    const el = img(container)!;

    expect(el.className).toContain('rotate-90');
    expect(el.style.height).toBe('90px');
    expect(el.style.width).toBe(`${(90 * 88) / 63}px`);
  });

  it('does not rotate a face-up landscape card (its art is already sideways)', () => {
    // A revealed Plan or a Story card shows its own landscape art — no rotation.
    const { container } = render(
      <CardFace src="/story.webp" name="Story" faceDown={false} landscape width={126} />
    );
    const el = img(container)!;

    expect(el.className).not.toContain('rotate-90');
    expect(el.className).toContain('object-cover');
  });

  it('falls back to the card name when there is no image', () => {
    const { container, getByText } = render(
      <CardFace src={null} name="Twilight Sparkle" faceDown={false} landscape={false} width={90} />
    );

    expect(img(container)).toBeNull();
    expect(getByText('Twilight Sparkle')).toBeTruthy();
  });

  it('pulses the fallback while hydrating', () => {
    const { getByText } = render(
      <CardFace src={null} name="…" faceDown landscape={false} width={90} pulse />
    );
    expect(getByText('…').className).toContain('animate-pulse');
  });
});

describe('cardBack', () => {
  const backs = { scene: '/backs/scene.webp', generic: '/backs/generic.webp' };

  const instance = (card: Partial<Card>): CardInstance => ({
    uid: 'u',
    card: {
      card_number: 'BP01-C01',
      name: 'Test',
      subtype: 'character',
      rarity: 'C',
      set_code: 'BP01',
      harmony_cost: null,
      inspiration: null,
      story_stage: null,
      image_url: null,
      thumb_url: null,
      card_back_url: null,
      release_status: 'released',
      variant: null,
      ...card,
    },
    tapped: false,
    faceDown: false,
    counters: 0,
    inspiration: null,
  });

  it("prefers a card's own back art where it has some", () => {
    const rubyRare = instance({ subtype: 'main-character', card_back_url: '/backs/rr.webp' });

    expect(cardBack(rubyRare, backs)).toBe('/backs/rr.webp');
  });

  it('gives a Scene the scene back and everything else the generic one', () => {
    expect(cardBack(instance({ subtype: 'scene' }), backs)).toBe('/backs/scene.webp');
    expect(cardBack(instance({ subtype: 'character' }), backs)).toBe('/backs/generic.webp');
    expect(cardBack(instance({ subtype: 'story' }), backs)).toBe('/backs/generic.webp');
  });

  it('draws nothing rather than guessing when the snapshot has no backs', () => {
    // A deck imported before the endpoint carried them. Constructing a URL here
    // would be this app hard-coding a path into a bucket it does not own.
    expect(cardBack(instance({ subtype: 'character' }), null)).toBeNull();
  });

  it("still uses a card's own back when the snapshot has none", () => {
    const rubyRare = instance({ card_back_url: '/backs/rr.webp' });

    expect(cardBack(rubyRare, null)).toBe('/backs/rr.webp');
  });
});

describe('backIsLandscape', () => {
  it('is true only for a story card with its own back art', () => {
    expect(backIsLandscape({ subtype: 'story', card_back_url: '/backs/story.webp' })).toBe(true);
  });

  it('is false for a story card on the shared back', () => {
    expect(backIsLandscape({ subtype: 'story', card_back_url: null })).toBe(false);
  });

  it('is false for the portrait Ruby Rare Main Character backs', () => {
    expect(backIsLandscape({ subtype: 'main-character', card_back_url: '/backs/rr.webp' })).toBe(
      false
    );
  });

  it('is false for nothing at all', () => {
    expect(backIsLandscape(null)).toBe(false);
    expect(backIsLandscape(undefined)).toBe(false);
  });
});
