import { Card } from '@/types/cards';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HIDDEN_ZONES, PUBLIC_ZONES, PublicState, StateFrame, WireInstance } from './types';
import { useMirror } from './useMirror';

function card(cardNumber: string): Card {
  return {
    card_number: cardNumber,
    name: `Card ${cardNumber}`,
    subtype: 'character',
    rarity: 'C',
    set_code: 'TEST',
    harmony_cost: 1,
    inspiration: 2,
    story_stage: null,
    card_text: null,
    image_url: `https://example.test/${cardNumber}.webp`,
    thumb_url: null,
    card_back_url: null,
    release_status: 'released',
    variant: null,
    ...({} as Partial<Card>),
  };
}

function wire(overrides: Partial<WireInstance> = {}): WireInstance {
  return {
    uid: 'w1',
    cardNumber: 'TEST-C01',
    tapped: false,
    faceDown: false,
    counters: 0,
    inspiration: null,
    ...overrides,
  };
}

function publicState(zones: Partial<Record<string, WireInstance[]>> = {}): PublicState {
  return {
    zones: Object.fromEntries(
      PUBLIC_ZONES.map((zone) => [zone, zones[zone] ?? []])
    ) as PublicState['zones'],
    counts: Object.fromEntries(
      HIDDEN_ZONES.map((zone) => [zone, 0])
    ) as PublicState['counts'],
    turn: 1,
    started: true,
  };
}

const frame = (seq: number, state: PublicState, session = 's1'): StateFrame => ({
  session,
  seq,
  state,
});

/** Resolves every number, and counts how often it was asked. */
const resolver = () => vi.fn(async (number: string) => card(number));

/** Let in-flight lookups settle, so their state updates land inside the test. */
const settle = () => act(async () => {});

describe('useMirror', () => {
  it('starts empty and takes its first frame', async () => {
    const { result } = renderHook(() => useMirror(resolver()));

    expect(result.current.mirror).toBeNull();

    act(() => result.current.receive(frame(1, publicState({ adventureC: [wire()] }))));

    expect(result.current.mirror?.zones.adventureC).toHaveLength(1);
    await settle();
  });

  it('resolves a revealed card and fills it in', async () => {
    const lookup = resolver();
    const { result } = renderHook(() => useMirror(lookup));

    act(() => result.current.receive(frame(1, publicState({ adventureC: [wire()] }))));

    // Rendered before it resolves, carrying its number so the board is never
    // missing a card while a lookup is in flight.
    expect(result.current.mirror?.zones.adventureC[0].card.name).toBe('TEST-C01');

    await waitFor(() =>
      expect(result.current.mirror?.zones.adventureC[0].card.name).toBe('Card TEST-C01')
    );
    expect(lookup).toHaveBeenCalledWith('TEST-C01');
  });

  it('asks for a card once however many frames mention it', async () => {
    const lookup = resolver();
    const { result } = renderHook(() => useMirror(lookup));

    act(() => result.current.receive(frame(1, publicState({ adventureC: [wire()] }))));
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));

    act(() => result.current.receive(frame(2, publicState({ adventureL: [wire()] }))));
    act(() => result.current.receive(frame(3, publicState({ reveal: [wire()] }))));

    await waitFor(() => expect(result.current.mirror?.zones.reveal).toHaveLength(1));
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('never asks for a face-down card', async () => {
    const lookup = resolver();
    const { result } = renderHook(() => useMirror(lookup));

    act(() =>
      result.current.receive(
        frame(1, publicState({ planII: [wire({ cardNumber: null, faceDown: true })] }))
      )
    );

    expect(lookup).not.toHaveBeenCalled();
    expect(result.current.mirror?.zones.planII[0].faceDown).toBe(true);
  });

  it('keeps the board when a card cannot be resolved', async () => {
    const lookup = vi.fn(async () => null);
    const { result } = renderHook(() => useMirror(lookup));

    act(() => result.current.receive(frame(1, publicState({ adventureC: [wire()] }))));

    await waitFor(() => expect(lookup).toHaveBeenCalled());
    expect(result.current.mirror?.zones.adventureC).toHaveLength(1);
    expect(result.current.mirror?.zones.adventureC[0].card.image_url).toBeNull();
  });

  it('retries a number whose lookup failed when it is seen again', async () => {
    const lookup = vi
      .fn<(n: string) => Promise<Card | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(card('TEST-C01'));
    const { result } = renderHook(() => useMirror(lookup));

    act(() => result.current.receive(frame(1, publicState({ adventureC: [wire()] }))));
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));

    act(() => result.current.receive(frame(2, publicState({ reveal: [wire()] }))));

    await waitFor(() =>
      expect(result.current.mirror?.zones.reveal[0].card.name).toBe('Card TEST-C01')
    );
  });

  it('ignores a frame it has already moved past', async () => {
    const { result } = renderHook(() => useMirror(resolver()));

    act(() => result.current.receive(frame(5, publicState({ adventureC: [wire()] }))));
    act(() => result.current.receive(frame(3, publicState({ adventureC: [] }))));

    expect(result.current.mirror?.zones.adventureC).toHaveLength(1);
    await settle();
  });

  it('takes a frame from a new session even when its seq is lower', async () => {
    const { result } = renderHook(() => useMirror(resolver()));

    act(() => result.current.receive(frame(9, publicState({ adventureC: [wire()] }))));
    act(() => result.current.receive(frame(1, publicState({ adventureC: [] }), 's2')));

    expect(result.current.mirror?.zones.adventureC).toHaveLength(0);
    await settle();
  });

  it('starts from a saved board when the page hands one over', async () => {
    const saved = publicState({ adventureC: [wire({ uid: 'from-server' })] });
    const { result } = renderHook(() => useMirror(resolver(), saved));

    expect(result.current.mirror?.zones.adventureC[0].uid).toBe('from-server');
    await settle();
  });

  it('carries the hidden zone counts through', async () => {
    const { result } = renderHook(() => useMirror(resolver()));
    const state = publicState();
    state.counts = { library: 41, hand: 5, sceneDeck: 14 };

    act(() => result.current.receive(frame(1, state)));

    expect(result.current.mirror?.counts).toEqual({ library: 41, hand: 5, sceneDeck: 14 });
    await settle();
  });
});
