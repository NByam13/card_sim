import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TableRings } from '../mlp/MlpTable';
import { emptyMirror } from '../sync/hydrate';
import MirrorBoard from './MirrorBoard';

const lanesLeftToRight = () => screen.getAllByText(/^Lane \d$/).map((label) => label.textContent);

const lane = (label: string) =>
  screen.getByText(label).closest('[class*="rounded-lg"]') as HTMLElement;

const half = () => screen.getByText('Scene Zone').closest('[class*="rounded-xl"]') as HTMLElement;

const ringedLanes = () =>
  ['Lane 1', 'Lane 2', 'Lane 3'].filter((label) => lane(label).className.includes('ring-amber'));

const renderMirror = (goingFirst: boolean | null, rings?: TableRings) =>
  render(
    <MirrorBoard
      state={emptyMirror()}
      scale={1}
      onScaleChange={() => {}}
      backs={null}
      name="Rarity"
      present
      goingFirst={goingFirst}
      rings={rings}
    />
  );

describe('MirrorBoard', () => {
  it('faces an opponent on the draw Lane 1 to Lane 1 with a board on the play', () => {
    renderMirror(false);

    expect(lanesLeftToRight()).toEqual(['Lane 1', 'Lane 2', 'Lane 3']);
  });

  it('faces an opponent on the play Lane 1 to Lane 1 with a board on the draw', () => {
    renderMirror(true);

    expect(lanesLeftToRight()).toEqual(['Lane 3', 'Lane 2', 'Lane 1']);
  });

  it('rings the half while the opponent is acting', () => {
    renderMirror(true, { acting: true, contactLane: null });

    expect(half().className).toContain('ring-emerald');
  });

  it('leaves the half unringed while you are acting', () => {
    renderMirror(true, { acting: false, contactLane: null });

    expect(half().className).not.toContain('ring-emerald');
  });

  it('rings the lane in contact by its contact order, whichever side it is drawn on', () => {
    const { rerender } = renderMirror(true, { acting: false, contactLane: 1 });

    expect(ringedLanes()).toEqual(['Lane 1']);
    expect(lanesLeftToRight().at(-1)).toBe('Lane 1');

    rerender(
      <MirrorBoard
        state={emptyMirror()}
        scale={1}
        onScaleChange={() => {}}
        backs={null}
        name="Rarity"
        present
        goingFirst={true}
        rings={{ acting: false, contactLane: 3 }}
      />
    );

    expect(ringedLanes()).toEqual(['Lane 3']);
  });

  it('rings no lane outside contact', () => {
    renderMirror(false, { acting: true, contactLane: null });

    expect(ringedLanes()).toEqual([]);
  });
});
