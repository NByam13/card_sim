# Local Board: Spec

**Status:** Not started
**Branch:** `feat/local-board`
**Last updated:** 2026-09-23

## Summary

The table itself, for one seat, playing alone. A player who holds a seat opens their game and sees
their own half of the MLP board, dealt from the deck snapshot already on the row, and can move
cards around it: drag, multi-select, zoom, tap, flip, draw, shuffle, mulligan, take a turn. The
opponent's half is not rendered, nothing is broadcast, and nothing is saved.

This is the second piece of the PvP decoupling and the largest. The lobby it sits on is
[`../anonymous-games/spec.md`](../anonymous-games/spec.md); the plan it serves and the audit that
sizes it are `documentation/pvp-decoupling/{spec,board-audit}.md` in the PonyRec repo.

## Goals

- A seat holder sees their deck dealt onto the MLP table and can play it, alone, end to end.
- The board's behaviour matches PonyRec's playtest board action for action, including the edge
  cases its unit tests pin down.
- The ported unit suites run here and pass, so the sync slice that follows has a safety net.
- No server surface is added. The deal reads the snapshot the lobby already stored.

## Non-goals for this slice

The opponent's half of the table, in any form: no mirror, no redaction, no snapshot frames, no
broadcasting. No persistence — a refresh re-deals. No turn order, no shared turn cursor, no phase
track, no scoring, no win claim, no spectators, no tutorial, no contact hint.

And, explicitly, **no setup abstraction.** See below.

## Decisions on record

### Parity first: the board arrives still typed against MLP

Inherited from the PvP spec's "Port to parity first, then generalise", and restated here because
it is the decision this slice is most likely to be talked out of.

The board comes over with `ZoneId` as MLP's union, Plans and Story stages and Adventure lanes
named in the types, and `useGame`'s MLP actions intact. The setup-module design in the audit —
zones as data, `setup.deal(deck)`, composed actions — is **not** built yet.

- **Why:** generalising during the move rewrites ~5,200 lines with nothing working to compare
  against. Porting first means every behavioural difference is a bug against a running reference,
  and the ported tests say so.
- **What it costs:** a second pass over the same files later. Accepted knowingly; the audit already
  priced it.
- **When the seam gets built:** after two browsers play a full match here, with the sync and
  scoring slices' tests in place. That is the same milestone that lets `pvp` switch off on
  PonyRec.

### Split in two PRs: the model, then the table

The slice is too big for one reviewable change, and it has a clean joint: everything below the
React tree is pure, and everything above it is layout.

**(a) The game model.** `types.ts`, `setup.ts`, `useGame.ts`, and the MLP domain helpers the deal
borrows. Pure TypeScript, no components, no page changes. It lands with the ported unit suites —
`useGame.test.ts` (872 lines), `setup.test.ts` (273) — which is what makes it reviewable: the tests
are the specification of what was ported, and they pass or they do not.

**(b) The table.** The DnD context, zones, the card, the hand fan, marquee selection, the card
menu, keyboard shortcuts, the zone viewers, the board shell and the MLP layout. Mounted on
`games/show.tsx` behind the seat the page already derives.

Nothing in (a) imports React beyond `useReducer`, so (a) can merge and sit unused without holding
anything up.

### The card type is the deck endpoint's card, not PonyRec's

PonyRec's `Card` is its whole catalogue model — rarity axes, keywords, effects, tags, a
`triggerRegistry` import from the pipeline. None of that crosses the seam and none of it belongs
here.

This app's `Card` is exactly the card object in `documentation/deck-lookup-api/api.md`:
`card_number`, `name`, `subtype`, `rarity`, `set_code`, `harmony_cost`, `inspiration`,
`story_stage`, `image_url`, `thumb_url`, `card_back_url`, `release_status`, `variant`. Nothing
more, and specifically **no `id`** — `card_number` is the identity, and no PonyRec primary key
crosses the seam.

This is not yet the audit's generic card (which drops `inspiration` and `story_stage` into
setup-named stats). It is the parity-port card: MLP-shaped, but only as MLP-shaped as the wire
already is.

Image URLs are used exactly as returned and never derived, per the contract.

### `copyKey` cannot be ported faithfully — and that is a contract gap

PonyRec's `copyKey` is `replace(printed_number || card_number, '※', '')`. `printed_number` is what
collapses Day/Night art variants onto one base printing: `Card::copyKey()` reads it precisely when
`variant_kind === 'art'`. **The deck endpoint does not return `printed_number`.**

Only one thing here reads `copyKey`: `arrangeSceneDeck`'s test for "is every card in the Scene Deck
the same base printing", which decides whether shining printings float to the top. Without
`printed_number`, a Scene Deck of fifteen Day/Night variants of one scene reads as many printings
and skips the float.

- **The failure is graceful** — the deck just shuffles and stops, which is what a multi-printing
  Scene Deck does anyway. Nothing breaks.
- **The fix belongs on PonyRec**, not here. `printed_number` already survives `CardPool`'s column
  pruning with the comment "client copyKey", so the field exists and is meant for exactly this
  consumer; the deck endpoint simply omitted it. Adding it is one field and one line of contract.
- **Until then**, this app derives the base printing from the `variant` object the contract *does*
  return: an `art` variant's trailing letter is stripped, everything else is `card_number` minus
  the ※. That reproduces `copyKey` for every case the endpoint describes, and it is commented as a
  stand-in with the PonyRec-side fix named, so it is removed rather than forgotten.

Tracked in Open questions.

### The deal reads the snapshot, and the server stays out of it

`GET /games/{code}` already passes the game to the page. The deal happens in the browser, from
`host_deck`/`guest_deck`, using the same shuffle that ships with it.

- **Why client-side:** the audit's whole sync design is trusted clients each owning their half.
  A server-side deal would be the first thing to contradict it, and it would need the rules the
  server deliberately does not have.
- **What this slice does not decide:** whose shuffle is authoritative when both seats deal. That
  question belongs to the sync slice, which is where a second board first exists.
- **The CSPRNG shuffle ports exactly.** `randomInt`'s rejection sampling, the pile shuffle, and
  the Fisher–Yates on either side of it come over unchanged — the audit calls it out as worth
  keeping verbatim, and its reasoning is in the comments.

### A board with no deck is a real state, not an error

The lobby lets a seat be claimed with any deck PonyRec serves, and the endpoint deliberately does
not refuse an incomplete one ("a table decides what an incomplete deck means; the endpoint does
not"). So the deal has to survive a deck with no Main Character, fewer than four Story cards, an
empty Scene Deck and a short Main Deck.

Ported behaviour: missing pieces leave their zones empty, the board still deals, and the controls
say what is missing rather than refusing to start. PonyRec's incomplete-deck checks (50 Main, 15
Scene, 4 Story, a Main Character) come over as advisory text.

### Tests are ported, not rewritten

The unit suites come over as close to verbatim as the import paths and the card type allow. Where
a test constructs a PonyRec `Card`, it constructs this app's card instead; where it asserts on
behaviour, it is not touched.

A test that has to change to pass is a port bug until proven otherwise. The two known, allowed
edits are the card factory and the `copyKey` stand-in above.

This needs Vitest, which this app does not have. See Dependencies.

## Dependencies to add

None of these are in `package.json` today, and per the project's rules they need sign-off before
the first PR.

| Package | For | Notes |
| --- | --- | --- |
| `vitest`, `jsdom` | The ported unit suites | PonyRec runs the same pair from a `vitest.config.ts` kept separate from the Vite config so the Laravel plugin does not load under test. Same arrangement here. |
| `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event` | (b) only | Not needed for the model PR. |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | (b) only | What the board's drag and drop is built on. |

The React Compiler stays **off**, per the PvP spec: the board assigns refs during render and the
compiler breaks that silently.

## Layout

Ported into a `resources/js/board/` tree rather than PonyRec's `decks/playtest/`, since there are
no decks in this app to be a playtest of. The `multiplayer/` and `games/` splits PonyRec needed do
not apply yet; this slice is one directory.

```
resources/js/board/
  types.ts          zones, CardInstance, GameState, lane numbering, orientation
  setup.ts          shuffle, the deal, arrangeSceneDeck
  useGame.ts        the reducer and its hook
  mlp.ts            copyKey / storyStageRank — the MLP domain bits the deal borrows
```

`types/cards.ts` gets this app's `Card`.

## Open questions

- **Will PonyRec add `printed_number` to the deck endpoint?** It is one field, the data already
  exists and is already annotated as being for this consumer, and it removes a stand-in here. Until
  it lands, the variant-derived fallback stands.
- **Does the board belong on `games/show.tsx` or its own route?** The lobby and the table are
  different enough that one page doing both may read badly, but splitting them means a second route
  that has to re-derive the seat. Deferred to (b), where there is something to look at.
- **What does "restart" mean once there are two seats?** Solo it re-deals. With an opponent it is
  either a desync or a rematch, and that is the sync slice's problem. Ported as-is for now.
