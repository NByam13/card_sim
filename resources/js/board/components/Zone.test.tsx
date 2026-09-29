import { Card } from '@/types/cards';
import { BoardDispatchProvider, BoardReadOnlyProvider } from '../context';
import { CardInstance } from '../types';
import { DndContext } from '@dnd-kit/core';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDroppable } from '@dnd-kit/core';
import Zone from './Zone';

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return { ...actual, useDroppable: vi.fn(actual.useDroppable) };
});

function inst(uid: string): CardInstance {
  return {
    uid,
    card: { name: `Scene ${uid}`, subtype: 'scene' } as Card,
    tapped: false,
    faceDown: false,
    counters: 0,
    inspiration: null,
  };
}

/** Ported from PonyRec's `Zone.test.tsx`. Empty `cards` keeps BoardCard out of it. */
function renderZone(props: Partial<React.ComponentProps<typeof Zone>> = {}) {
  return render(
    <DndContext>
      <Zone id="reveal" label="Reveal Zone" cards={[]} {...props} />
    </DndContext>
  );
}

const label = (c: HTMLElement) => c.querySelector('.pointer-events-none')!;

describe('Zone', () => {
  it('renders the label as a corner badge rather than a stacked header', () => {
    const { container } = renderZone();

    expect(label(container).textContent).toContain('Reveal Zone');
    expect(label(container).className).toContain('absolute');
  });

  it('does not stack the label above card content', () => {
    // Regression: with z-20 the label painted over cards, clipping the
    // harmony-cost badge that overhangs a card's top-left corner. Leaving
    // z-index at auto lets the cards — later in DOM order — win.
    expect(label(renderZone().container).className).not.toMatch(/(^|\s)z-\d/);
  });

  it('keeps the header action stacked on top, since it must stay clickable', () => {
    const { container } = renderZone({ headerAction: <button>menu</button> });
    const action = container.querySelector('button')!.parentElement!;

    expect(action.className).toMatch(/(^|\s)z-\d/);
  });

  it('shows the count inline in the label when given one', () => {
    expect(label(renderZone({ count: 3 }).container).textContent).toContain('(3)');
  });

  it("centres an Adventure lane's cards in the lane, both ways", () => {
    // A lane reserves more room than one card needs, so an uncentred row sits
    // in its top-left corner with the slack below and beside it.
    const { container } = renderZone({ id: 'adventureL', label: 'Lane 1', overlap: true });

    const lane = container.firstElementChild!;
    const row = lane.querySelector('.flex:not(.absolute)')!;

    // The lane is a column, so the row can be told to fill it.
    expect(lane.className).toContain('flex flex-col');
    expect(row.className).toContain('flex-1');
    expect(row.className).toContain('items-center');
    expect(row.className).toContain('justify-center');
  });

  it('leaves a non-overlapping zone laid out from the start of the box', () => {
    // Only the lanes reserve more room than their content needs.
    const { container } = renderZone();

    expect(container.firstElementChild!.className).not.toContain('flex-col');
  });

  it('fans its cards into one fixed-height row instead of wrapping them', () => {
    // The Scene Zone holds up to 15 cards, and a wrapped second row costs the
    // two-player table height it cannot spare.
    const cards = [inst('a'), inst('b'), inst('c')];
    const { container } = render(
      <DndContext>
        <BoardDispatchProvider value={vi.fn()}>
          <Zone id="scene" label="Scene Zone" cards={cards} fan />
        </BoardDispatchProvider>
      </DndContext>
    );

    const row = container.querySelector('.relative.w-full') as HTMLElement;

    expect(row).not.toBeNull();
    expect(row.style.height).not.toBe('');
    // Every card is positioned, not flowed, so the row can never wrap.
    expect(row.querySelectorAll(':scope > .absolute')).toHaveLength(3);
    expect(row.className).not.toContain('flex-wrap');
  });
});

/**
 * The mirror renders the same zone ids as your own board, inside the same
 * DndContext — `BoardShell` puts its `header` inside it. dnd-kit keys
 * droppables by id and a later registration replaces an earlier one, so a
 * mirror zone registering as `reveal` would take the real Reveal Zone's place
 * in the registry as a disabled container, and nothing on your own board would
 * accept a drop for the rest of the match.
 */
describe('Zone in a mirror', () => {
  const idsUsed = () =>
    vi.mocked(useDroppable).mock.calls.map(([args]) => args as { id: string; disabled?: boolean });

  it('registers its droppable under the id it was given', () => {
    vi.mocked(useDroppable).mockClear();
    renderZone({ id: 'reveal' });

    expect(idsUsed().at(-1)).toMatchObject({ id: 'reveal', disabled: false });
  });

  it('never registers a read-only zone under your board’s id', () => {
    vi.mocked(useDroppable).mockClear();
    render(
      <BoardReadOnlyProvider value={true}>
        <DndContext>
          <Zone id="reveal" label="Reveal Zone" cards={[]} />
        </DndContext>
      </BoardReadOnlyProvider>
    );

    const registered = idsUsed().at(-1)!;

    expect(registered.id).not.toBe('reveal');
    expect(registered.disabled).toBe(true);
  });
});
