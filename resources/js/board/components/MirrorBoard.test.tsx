import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { emptyMirror } from '../sync/hydrate';
import MirrorBoard from './MirrorBoard';

const lanesLeftToRight = () => screen.getAllByText(/^Lane \d$/).map((label) => label.textContent);

const renderMirror = (goingFirst: boolean | null) =>
  render(
    <MirrorBoard
      state={emptyMirror()}
      scale={1}
      onScaleChange={() => {}}
      backs={null}
      name="Rarity"
      present
      goingFirst={goingFirst}
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
});
