# PvP Board Audit: MLP Coupling

**Last updated:** 2026-09-14

How much Kayou MLP knowledge is baked into the playtest board and the PvP layer, and what that
means for a game-agnostic table. Companion to [`spec.md`](spec.md).

## Method

Read the reducer, zone model, multiplayer modules, board components and the server side, then
counted references to MLP concepts (Adventure lanes, Story, Plan, Scene, Main Character,
Inspiration, contact, mulligan, Retire, tokens, going first) per file. Line counts below are
non-test source including comments. These files are comment-heavy, so the counts size the work
rather than measure it.

## Headline

The coupling is concentrated, not smeared. The interaction engine (drag and drop, marquee
selection, hand fanning, zoom, hover targeting, the keyboard dispatcher, zone viewers) and the
whole sync layer (redaction, snapshot frames, spectator mirrors, the action log) are game-agnostic
in *behaviour*. They are typed against MLP's zone list, though, so almost none of it compiles
unchanged. The rules live in a handful of places: the zone list, the opening deal, about half the
reducer's actions, the turn track, the two hand-built table layouts, the card menu and the key
bindings.

| Bucket | Source lines | What it means |
| --- | ---: | --- |
| Keep | ~2,700 | Lift with little more than import changes |
| Generalise | ~5,200 | Structure stays; MLP constants become setup data or hooks |
| Redesign | ~1,200 | The MLP layout *is* the code; rebuild around a setup |
| Server | ~1,400 | Rewritten in the new app regardless (accounts, Reverb, PonyRec models) |

Most of the reuse sits in "generalise": the logic is right but its types are MLP's. The unit tests
port with it and are worth as much as the code (`useGame.test.ts` alone is 872 lines of edge cases).

## Recommended shape

A **game setup is a TypeScript module**, not a config file. It supplies:

- **zones**: id, label, visibility (hidden, count-only, public), how it lays out (pile, row, fan,
  overlap, stack), whether entering it reveals a card, and whether browsing it reshuffles
- **setup(deck)**: how deck sections become an opening board
- **actions**: its extra reducer actions, built from generic primitives (move, draw, shuffle, flip)
- **turn track**: the stops for a given turn, their labels, and when each unlocks
- **layout**: a React component that places generic `Zone`s, rendered for your seat or mirrored
  read-only for the opponent's
- **key bindings and card menu rows** it adds
- **win prompt**, card-back choice, and the tutorial copy

Why code rather than data: MLP's quirks are not configuration. Shining Scenes float to the top of a
single-printing Scene Deck, Plans refill IV→I, the Main Character climbs a fixed chain, lanes
renumber by seat. A config language able to express those becomes a programming language badly. A
simpler declarative format for zone-only games can come later if anyone wants one.

## Keep

Game-agnostic already.

| File | Notes |
| --- | --- |
| `decks/playtest/fan.ts`, `FanRow.tsx`, `HandZone.tsx` | Hand and row fanning |
| `decks/playtest/selection.ts`, `useMarquee.ts`, `MarqueeBox.tsx`, `SelectionChip.tsx` | Multi-select |
| `decks/playtest/hoverTarget.ts`, `zoomPreference.ts`, `ZoomControls.tsx` | Hover and zoom |
| `decks/playtest/randomizers.ts`, `Randomizers.tsx` | Dice and coin |
| `decks/playtest/context.ts` | Providers; drop the Plan-slot and tokens contexts into the MLP setup |
| `ZoneMenu.tsx`, `ShortcutOverlay.tsx`, `ShortcutsButton.tsx` | Render whatever they are given |
| `multiplayer/acceptFrame.ts`, `multiplayer/focus.ts` | Frame ordering, mirror focus |
| `games/useOpponentMirror.ts`, `useSpectatorMirrors.ts`, `useMirrorNarration.ts` | Mirror plumbing |
| `games/useGameChannel.ts`, `games/postJson.ts` | Keep the logic; rebind to the new transport and routes |
| `GameLog`, `MatchScore`, `MatchResult`, `MatchFormatToggle`, `SpectatorCount`, `SpectatorView`, `DesktopOnlyNotice`, `Coachmark`, `MirrorCardMenu`, `MirrorRetireModal`, `TurnOrderPanel`, `WinClaimModal`, `WaitingRoom` | Chrome. A few strings name MLP zones; `WaitingRoom` assumes accounts |
| `setup.ts`: `shuffle`, `randomInt`, `uid`, `expand` | The CSPRNG shuffle is worth keeping exactly |

## Generalise

The structure is right; the MLP-specific parts move into the MLP setup.

| File | MLP coupling | Becomes |
| --- | --- | --- |
| `decks/playtest/types.ts` | The `ZoneId` union, lane and story zone lists, `laneNumber`, `rendersLandscape`, `OPENING_HAND_SIZE`, `PLAN_COUNT`, `isToken` | Zone ids as strings from the setup. Orientation and seat-mirrored ordering become zone properties |
| `CardInstance` | `inspiration` override | Generic per-card stat overrides the setup names (`tapped`, `faceDown`, `counters` stay) |
| `decks/playtest/useGame.ts` | Generic: move(s), draw, tap, flip, set-state, counters, tutor, spawn and remove token, restart. MLP: `START_GAME` (deals Plans, first Scene face down when on the play), `MULLIGAN` (to the bottom, no shuffle, once), `NEXT_TURN` (untap, reveal Scene, draw), `REVEAL_SCENE`, `TO_PLAN`, `PROMOTE_STAGE`, and the hard-coded `library`/`sceneDeck`/`hand` ids | A generic reducer, plus setup actions composed from its primitives. `SHUFFLE_LIBRARY`/`SHUFFLE_SCENE_DECK` collapse into `SHUFFLE(zone)` |
| `setup.ts` `initialState`, `arrangeSceneDeck` | Deck sections `main`/`scene`/`story`, the story-stage ordering, the shining sort | `setup.deal(deck)` in the MLP module |
| `multiplayer/phases.ts` | `main`/`contact`/`end`, one contact stop per lane, contact unlocking on turn 3, no draw on turn 1 | The mechanism (stops, cursor, next and previous, collapsed display) is generic and already well factored. The stop list and unlock rules come from the setup |
| `multiplayer/types.ts`, `redact.ts`, `persist.ts` | `HIDDEN_ZONES`, `inspiration` on the wire | Derived from zone visibility. The redaction choke point stays exactly as designed |
| `multiplayer/log.ts` | Zone labels, "Plans dealt, first Scene revealed", inspiration wording | Labels and setup lines from the setup; the snapshot-diff narration is generic |
| `multiplayer/victory.ts` | Main Character on Story IV | `setup.winPrompt(state)` |
| `multiplayer/phaseRings.ts` | "contact lane" ring | Generic "active zone" ring |
| `shortcuts.ts`, `useBoardShortcuts.ts` | `1`/`2`/`3` play to lanes, `p` plans, promote, `z` resets Inspiration, `r` retires in lanes but reveals elsewhere | Generic dispatcher plus a setup keymap |
| `CardContextMenu.tsx` | Most rows are generic. MLP: Reveal only from hand and Plans, To Plan, Retire vs Discard, Inspiration rows, tokens only on Characters, Scenes returning to the Scene Deck | Generic rows plus rows contributed by the setup |
| `PlaytestCard.tsx`, `MirrorCard.tsx` | Inspiration badge, story backs landscape, RR main-character backs | Stat badges from setup stat definitions; back art from the card data |
| `DeckPile.tsx`, `Zone.tsx`, `ZoneViewerModal.tsx` | `Zone`'s `stack` mode centres a Main Character over a Story card | Keep the layout modes; the "who stands on top" rule moves out |
| `PlaytestControls.tsx`, `PlaytestArena.tsx` | Mulligan, going first, the incomplete-deck checks (50 Main, 15 Scene, 4 Story, a Main Character), Plan-slot toasts | Generic controls; mulligan and going first as setup options, since most TCGs have both; deck checks from the setup |
| `MultiplayerBoard.tsx`, `SpectatorBoard.tsx`, `LiveGame.tsx`, `Pages/Games/Show.tsx` | Victory, contact hint and tutorial wiring, seat lane numbering | Orchestration stays; the MLP hooks come from the setup |
| `JoinGame.tsx` | Signed-in join | Anonymous seat claim |
| `@/types/cards` `Card` | PonyRec's full card model (rarity, subtype, story stage, inspiration) | A small generic card (id, name, images, orientation, stats, type). The MLP setup maps PonyRec's API response into it |
| `decks/legality.ts` `copyKey`, `storyStageRank` | PonyRec domain code the deal borrows | Copied into the MLP setup |

## Redesign

Here the MLP table *is* the code.

| File | Why |
| --- | --- |
| `PlaytestBoard.tsx` (607 lines) | Roughly half is generic and worth keeping: the DnD context, drag overlay, group drag, hand drop-index measuring and the scroll container. The other half is the MLP table built by hand: the Main Character rail, three lanes plus a Reveal gutter, four Story stages with overlapping Plans, the Scene fan and the out-of-play bar. Split it into a generic board shell and the MLP layout component. |
| `OpponentBoard.tsx` (393 lines, the most MLP references per line of any file) | A second, hand-mirrored copy of the same table. With a setup layout that can render mirrored and read-only, this file stops existing. It is the largest drift risk today: any layout change has to be made twice. |
| `multiplayer/tutorialSteps.ts`, `PvpTutorial.tsx`, `ContactHint.tsx` | MLP teaching copy anchored to MLP zones. Move to the setup, or drop for v1. |

## Server side (rewrite)

`GameController` (545), `Game` (367), the spectator guard and identity, four form requests and nine
broadcast events. None of it moves as-is, because all of it assumes PonyRec: user foreign keys and
policies, deck foreign keys, the local `cards` table for hydration (`GameController::cards`), the
user tutorial-preference columns, and MLP phase validation (`Game::PHASES`, `FIRST_CONTACT_TURN`,
`contact_lane`).

What carries over as design: trusted clients each owning their half, id-referenced snapshot frames
with a `{session, seq}` guard, a durable debounced state save beside per-action sync, server-held
turn order and turn cursor, best-of-three scoring, spectator seats, and pruning stale games. The
server should store the turn-track position as an opaque stop key and leave validating it to the
clients' shared setup, consistent with trusting clients everywhere else.

## Consequence for PonyRec's solo playtest

Solo playtest stays and uses the same `Components/Decks/Playtest` code. Once the new app forks the
board, the two copies drift. Recommendation: accept the fork and give PonyRec's solo board bug fixes
only. A shared package would stop the drift, but it publicly ties the two repos together, which cuts
against the separation. After cutover PonyRec can delete everything multiplayer-only, starting with
two small untangles: `PlaytestBoard` imports `phaseRings` and `PlaytestArena` imports the
`BoardPhase` type from the multiplayer folder.
