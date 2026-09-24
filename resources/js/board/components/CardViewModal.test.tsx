import { Card } from '@/types/cards';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CardViewModal from './CardViewModal';

function card(overrides: Partial<Card> = {}): Card {
  return {
    card_number: 'BP01-C01',
    name: 'Applejack',
    subtype: 'character',
    rarity: 'C',
    set_code: 'BP01',
    harmony_cost: 6,
    inspiration: 8,
    story_stage: null,
    card_text: null,
    image_url: 'https://example.test/applejack.webp',
    thumb_url: null,
    card_back_url: null,
    release_status: 'released',
    variant: null,
    ...overrides,
  };
}

function view(overrides: Partial<Card> = {}) {
  render(<CardViewModal card={card(overrides)} onClose={vi.fn()} />);
}

describe('CardViewModal', () => {
  it('shows the card name, its art and its printed numbers', () => {
    view();

    expect(screen.getByRole('heading', { name: 'Applejack' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Applejack' })).toHaveAttribute(
      'src',
      'https://example.test/applejack.webp'
    );
    expect(screen.getByText('Harmony').nextSibling).toHaveTextContent('6');
    expect(screen.getByText('Inspiration').nextSibling).toHaveTextContent('8');
  });

  /** A zero cost is a real cost, and a card that has none shows no row at all. */
  it('shows a zero cost but omits a null one', () => {
    view({ harmony_cost: 0, inspiration: null });

    expect(screen.getByText('Harmony').nextSibling).toHaveTextContent('0');
    expect(screen.queryByText('Inspiration')).not.toBeInTheDocument();
  });

  it('lifts an ability trigger out of the sentence it leads', () => {
    view({ card_text: '[Activated · Cost: Tap · Adventure Zone] Draw a card.' });

    expect(screen.getByText('Activated · Cost: Tap · Adventure Zone')).toBeInTheDocument();
    expect(screen.getByText('Draw a card.')).toBeInTheDocument();
  });

  it('splits a Character’s abilities on the blank line between them', () => {
    view({ card_text: '[Appear] Draw a card.\n\n[Farewell] Gain 1 Inspiration.' });

    expect(screen.getByText('Appear')).toBeInTheDocument();
    expect(screen.getByText('Farewell')).toBeInTheDocument();
  });

  /** The braces are PonyRec's marker for a printed banner, never text to show. */
  it('draws a {Mechanic} banner without its braces', () => {
    view({ card_text: '[Passive] {Leap} Characters in your hand gain it.' });

    expect(screen.getByText('Leap')).toBeInTheDocument();
    expect(screen.queryByText(/\{Leap\}/)).not.toBeInTheDocument();
  });

  it('renders text with no bracketed lead as plain text', () => {
    view({ subtype: 'event', card_text: 'Return a Character to its owner’s hand.' });

    expect(screen.getByText('Return a Character to its owner’s hand.')).toBeInTheDocument();
  });

  /**
   * The three text states are different facts. A card that prints none says
   * nothing; a snapshot that predates the field says so, because blaming the card
   * would be a lie about the card.
   */
  it('says nothing about text for a card that prints none', () => {
    view({ card_text: null });

    expect(screen.queryByText(/imported before card text/)).not.toBeInTheDocument();
  });

  it('explains an absent field rather than claiming the card has no text', () => {
    view({ card_text: undefined });

    expect(screen.getByText(/imported before card text/)).toBeInTheDocument();
  });

  it('keeps a frame for a card with no art', () => {
    view({ image_url: null });

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('No art for this card')).toBeInTheDocument();
  });
});
