import { Card } from '@/types/cards';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CardInstance } from '../types';
import MirrorRetire from './MirrorRetire';

function inst(uid: string, name: string, faceDown = false): CardInstance {
  return {
    uid,
    card: {
      card_number: uid,
      name,
      subtype: 'character',
      thumb_url: `https://example.test/${uid}.webp`,
    } as Card,
    tapped: false,
    faceDown,
    counters: 0,
    inspiration: null,
  };
}

const renderPile = (cards: CardInstance[]) => render(<MirrorRetire cards={cards} scale={1} />);

describe('MirrorRetire', () => {
  it('shows the pile as a count you can open', () => {
    renderPile([inst('a', 'Applejack'), inst('b', 'Rarity')]);

    expect(screen.getByRole('button', { name: /2 cards/i })).toBeTruthy();
  });

  it('lists the pile when opened', async () => {
    renderPile([inst('a', 'Applejack'), inst('b', 'Rarity')]);

    await userEvent.click(screen.getByRole('button', { name: /retire pile/i }));

    expect(screen.getByText('Applejack')).toBeTruthy();
    expect(screen.getByText('Rarity')).toBeTruthy();
  });

  it('filters the list by name', async () => {
    renderPile([inst('a', 'Applejack'), inst('b', 'Rarity')]);

    await userEvent.click(screen.getByRole('button', { name: /retire pile/i }));
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'rar');

    expect(screen.queryByText('Applejack')).toBeNull();
    expect(screen.getByText('Rarity')).toBeTruthy();
  });

  /**
   * Redaction strips a face-down card's identity on the way out, so this side
   * never learns what it was and must not imply otherwise.
   */
  it('names nothing a card was retired face down', async () => {
    renderPile([inst('a', 'Applejack', true)]);

    await userEvent.click(screen.getByRole('button', { name: /retire pile/i }));

    expect(screen.queryByText('Applejack')).toBeNull();
    expect(screen.getByText('Face-down card')).toBeTruthy();
  });

  /** Nothing on a mirror acts: the board's own viewer tutors, this one reads. */
  it('offers no action on a card', async () => {
    renderPile([inst('a', 'Applejack')]);

    await userEvent.click(screen.getByRole('button', { name: /retire pile/i }));

    expect(screen.queryByRole('button', { name: /to hand/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /to scene/i })).toBeNull();
  });

  it('says so when the pile is empty', async () => {
    renderPile([]);

    await userEvent.click(screen.getByRole('button', { name: /retire pile/i }));

    expect(screen.getByText(/pile is empty/i)).toBeTruthy();
  });
});
