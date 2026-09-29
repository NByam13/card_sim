# Board Sync: Spec

**Status:** In progress.
**Branch:** `feat/board-sync`
**Last updated:** 2026-09-29

## Summary

The other half of the table. Each seat relays its own board, redacted, to the rest of the game;
each seat renders the other's read-only mirror above its own. The board also becomes durable, so a
refresh resumes a match instead of re-dealing it.

This is the third piece of the PvP decoupling, and the one that makes the app a two-player game.
It sits on [`../local-board/spec.md`](../local-board/spec.md) and
[`../anonymous-games/spec.md`](../anonymous-games/spec.md); the plan it serves and the audit that
sizes it are `documentation/pvp-decoupling/{spec,board-audit}.md` in the PonyRec repo.

**It is the milestone that lets `pvp` switch off on PonyRec**, once two browsers play a full match
here.

## Goals

- Two browsers, two seats, each seeing the other's board move in real time.
- Hidden information stays hidden, through one choke point that is easy to point at and test.
- A refresh mid-match resumes both halves rather than re-dealing.
- No card knowledge is added to this app: a revealed card is resolved from PonyRec, which owns it.
- The sync layer stays game-agnostic in behaviour, as the audit found it.

## Non-goals for this slice

**Watchers.** A watcher keeps the lobby, exactly as today. They are a second consumer of the
frames this slice defines rather than new plumbing, and getting two seats playing is what unblocks
the cutover. The spectator cap and `SpectatorSeats` already exist and go untouched.

No turn order, no shared turn cursor, no phase track. No action log. No scoring, no win claim, no
rematch. No tutorial, no contact hint. Each remains its own slice.

And, still, **no setup abstraction**. Parity first, per the PvP spec. `ZoneId` stays MLP's union
and the mirror renders `MlpTable`.

## Decisions on record

### Frames are whole states, not deltas

Ported from PonyRec's `multiplayer/`. Every relayed frame is a complete redacted board carrying
`{session, seq}`, and `shouldAcceptFrame` decides whether a mirror has already moved past it.

- **Why whole states:** frames ride separate HTTP requests and can overtake each other. A delta
  applied out of order corrupts a board silently; a stale whole state is simply discarded.
- **Why `session`:** a new session always wins, because the sender remounted and its `seq`
  restarted from zero. Comparing `seq` alone would freeze the mirror until the counter caught up.
- **What it costs:** more bytes per message than a delta. Accepted — a redacted MLP board is small,
  and the alternative is a class of bug that only appears under load.

### Redaction happens on the sender, at one choke point

`redact(state)` turns a live board into a `PublicState`: hidden zones (`hand`, `library`,
`sceneDeck`) become counts, and a face-down card in a public zone keeps its position, tapped state
and counters but loses its identity **and its Inspiration override**, which would otherwise hint at
what it is.

- **Why on the client:** the whole sync design is trusted clients each owning their half. The
  server holds no rules and cannot recompute what is hidden.
- **Why one function:** it is the only place hidden information can leak, so it is the only place
  that has to be read carefully. Ported with its tests.

### The seat comes from the server, never from the payload

The relay endpoint reads the sender's seat from the session and stamps it on the broadcast. A
sender cannot claim one.

This is PON-42's lesson, and it is already how `GameChannel` decides a role here. The app key is
public and everyone on the table shares the channel, so server-stamped seats are the difference
between a mirror and a forgery.

**Nothing listens for Echo client events, and nothing may start.** Reverb cannot say who sent one,
and accepts them from connections that never subscribed. Not listening is what makes an injected
event inert.

### A revealed card is resolved from PonyRec, not from the opponent's snapshot

PonyRec's mirror hydrates cards by database id from its own catalogue. Neither the id nor the
catalogue crosses the seam, so this is the one part of the sync layer that cannot be ported and has
to be designed.

Frames carry `card_number`. When a mirror meets a number it does not know, it resolves it through a
lookup and caches it.

- **Not from the opponent's deck snapshot.** This app holds both snapshots, so serving card data
  from the other seat's is the obvious shortcut — and it hands out the opponent's decklist to
  anyone who enumerates card numbers. PonyRec never had to think about this because its catalogue
  is public either way; serving from a snapshot would invent the leak.
- **From the catalogue, which is public.** Enumerating it teaches nobody anything they could not
  already read on PonyRec. This restores exactly the property the ported design relied on, and
  keeps card data owned by the app that owns cards.
- **Not inline in the frame.** Embedding every public card's data would make frames self-contained
  at roughly 10–14KB each, several times a turn, and would put a copy of PonyRec's card data on
  this app's wire. Rejected for both reasons.

**Cached hard, in two layers.** Card data is effectively immutable, so a card is fetched once
rather than once per game:

```
mirror meets an unknown card_number
  └→ card_sim  GET /cards/{number}
       ├─ cache hit → return, with a long max-age so the browser caches too
       └─ miss → PonyRec GET /api/cards/{number} → cache, then return
```

**Proxied rather than called from the browser.** The PvP spec rejected the player's browser calling
PonyRec: it needs CORS and puts every player's address in PonyRec's logs. A proxy keeps that
decision — PonyRec sees one server, as it already does for deck imports — and the cache is shared
across every game and every player rather than living per-browser. The counter-argument is that art
is already hotlinked browser-to-bucket, so the principle is not absolute; the proxy is cheap enough
that it is not worth spending.

**The new PonyRec endpoint returns `DeckCardResource`.** Not `CardLookupResource`, which is the
Discord bot's contract: it carries keywords, `ponyrec_url` and `wiki_url`, and lacks `story_stage`,
`card_back_url`, `copy_key` and `card_text`. A mirror card of a different shape from a dealt card
would break the card view on exactly the cards you did not deal.

### Resolution is injected, not reached for

The mirror takes an `onCardLookup` hook rather than calling `fetch` itself. The detect-unknown,
resolve, cache loop is generic; where a card comes from is not.

- **Why:** it is the seam the setup module will own later, and until then it keeps the mirror
  game-agnostic exactly as the audit found it.
- **What it buys now:** a test passes a fake resolver instead of standing up a network.

### The shared card backs go to both seats

A face-down card in the mirror is redacted to nothing, so the mirror cannot reach its
`card_back_url` and must draw the shared back. Those live in `Deck.card_backs`, in the snapshot the
opponent deliberately never receives.

They are identical for every deck, so the page sends them to both seats. Small, and the mirror
draws blank frames without it.

### Relay and save are separate paths

Ported from PonyRec, which splits them for a reason worth keeping.

| | Fires | Carries | Writes |
| --- | --- | --- | --- |
| **Relay** `POST /games/{code}/sync` | every action | the redacted frame | nothing — broadcast only |
| **Save** `POST /games/{code}/state` | debounced | the full board, the redacted board, `seq` | the game row |

- **Why not one path:** a write on every action is a write per drag. The relay has to be immediate
  and the save does not.
- **Why the save carries both:** the full board restores *your* half on refresh; the redacted one
  is what the opponent's mirror starts from when they reload, without which they would stare at an
  empty table until you next moved.

### The saved board stores card numbers, not card data

`compactState` / `expandState`, ported, keyed on `card_number` instead of PonyRec's id. Every card
on your board came out of your own deck, so the number resolves against the snapshot already on the
row.

`expandState` returns null when a number no longer resolves, and the caller deals fresh. That is
the deck-was-edited case, and it is the reason a restore is allowed to fail quietly.

### The props for this already exist

`BoardArena` takes `savedState` and `onState` and neither has a caller. The local-board slice built
and tested the seam without using it, so persistence lands as wiring rather than surgery.

### Entering a two-player match is a handshake

A seat can already be on a board before the other one exists: the local-board slice added "Play
solo" so a host does not have to sit in the lobby waiting. When the second seat is taken, that
player is mid-game, and the match cannot simply begin underneath them.

So a match starts when **both seats have accepted it**, and a match starting re-deals **both**
halves — reshuffled deck, fresh opening hand — exactly as if neither had played a card.

- **A seat that has no board accepts by arriving.** Joining is accepting, recorded in the claim
  itself; a host waiting in the lobby accepts when the second seat is taken. Neither has a board
  for a match to start underneath, so the choice would be a click with one answer.
- **A seat in solo play is asked.** Presence delivers the news; a modal asks whether to start the
  match, and declining leaves their board untouched.
- **Declining is not recorded, and is not final.** "Not accepted yet" is the whole state, so the
  seat that declined keeps a standing invitation in the space opposite their board, and the seat
  waiting is told who they are waiting for. Either can be the one to move.
- **Why re-deal, and why both:** a solo board was dealt to goldfish an opening, often several
  times. Carrying the hand you liked into a real match is the mulligan hole the next decision
  closes, walked into by accident rather than by intent — and the seat that accepted first has
  been goldfishing too while it waited, so re-dealing only the accepter would leave the hole open
  on the other side of the table.

The flag is a column rather than page state because both halves of it have to survive a refresh: a
seat that declined and reloaded would otherwise be asked again, and the seat waiting on them would
lose the only thing telling it why the table is empty.

### Restart belongs to solo play

`RESTART` re-deals your own board, and nothing else. That is the right tool for goldfishing and the
wrong one for a match: it is not linked to the other seat, so it re-draws an opening hand in front
of an opponent who does not re-draw theirs, which is a way around the mulligan rules PonyRec
already enforces.

It stays for a seat playing alone and is absent once a match is live.

### The mirror has its own zoom

Your half and their half are separate surfaces, looked at differently: one is where you work, the
other is glanced at. They get separate controls and separate cookies, as PonyRec does.

`zoom.ts` already defines the `opponent` surface and its cookie for exactly this, so the mirror
reads and writes its own preference rather than sharing the board's.

### Their Retire pile is a peek and a list

Retire is a public zone, so it is already on the wire. Left undrawn it is the one public thing the
mirror receives and hides, and a player cannot answer "what have they used" without asking.

Drawn as PonyRec draws it: a small box in the mirror's strip showing the top card and a count — it
must not cost the table height — and clicking anywhere on it opens a read-only, searchable list.
Rows take the same hover preview every other public card on the table takes, so reading a retired
card costs no click.

Nothing in it acts. The board's own viewer offers tutor actions from the Retire pile; the mirror's
offers none, because every action there would be an action on a board this browser does not own.

## Data model

Columns this slice adds to `games`, per the PvP spec's table:

| Column | Type | Why |
| --- | --- | --- |
| `host_state` / `guest_state` | json, nullable | The full compact board, to restore your own half |
| `host_public_state` / `guest_public_state` | json, nullable | The redacted board, to seed the opponent's mirror on reload |
| `host_seq` / `guest_seq` | integer, default 0 | The last saved frame's sequence |
| `host_accepted_at` / `guest_accepted_at` | timestamp, nullable | When this seat accepted the match. Both set means it is live |

`turn_stop`, `winner_seat` and the scoring columns stay absent until the slices that use them.

## API / routes

**New on this app:**

- `POST /games/{code}/sync` — relay a redacted frame to the rest of the table. Seat from the
  session, `toOthers`, no write.
- `POST /games/{code}/state` — debounced durable save.
- `POST /games/{code}/accept` — this seat accepts the match. Seat from the session, idempotent.
- `GET /cards/{number}` — the cached card lookup. Not under `/games`: it is catalogue data, not
  game data, and the cache is shared across games.

**On PonyRec:** `GET /api/cards/{card:card_number}`, public and throttled on its own limiter,
returning `DeckCardResource`. Landed in that repo first, the way `card_text` did — PonyRec #172.

**New events**, both on the existing `game.{code}` presence channel:

- `BoardStateUpdated`, carrying the server-stamped seat.
- `MatchAccepted`, carrying the seat that accepted, so the other side stops waiting.

## Layout

```
resources/js/board/sync/
  types.ts         PublicState, WireInstance, StateFrame, FrameCursor, HIDDEN_ZONES
  redact.ts        the choke point
  acceptFrame.ts   frame ordering
  persist.ts       compactState / expandState
  hydrate.ts       a PublicState into the shape the table draws
  useMirror.ts     a mirror from frames, with onCardLookup injected
  useBoardRelay.ts sending: relay every change, save once it settles
  useGameSync.ts   the channel binding: presence, frames, announce
```

Sending is its own hook rather than part of `useGameSync`, because the two answer to different
things: one is bound to a channel's lifetime, the other to a board's changes.

`board/mlp/MlpTable.tsx` gains a read-only mirrored rendering. Per the audit, this is the file that
stops existing once the setup module lands — a second hand-mirrored copy is the largest drift risk
there is, so the mirror is a mode of the same component, never a second component.

## Questions this slice closed

- **Whose shuffle is authoritative?** Each seat's, over its own deck and nothing else. There is no
  action in which one seat's shuffle reaches the other's library, and there must never be one —
  which is the same rule the redaction choke point already enforces from the other side.
- **What does "restart" mean with two seats?** Nothing. It is a solo affordance and is absent from
  a live match, per the decision above. The rematch reading still belongs to the scoring slice.
- **Does the mirror need its own zoom?** Yes, with its own cookie. See the decision above.

## Still open

- **How stale is too stale?** A seat that closes its tab leaves a mirror frozen at its last frame,
  and presence already knows they are gone. The mirror says "away" against the seat's name, which
  is enough to not be misleading and less than the question deserves. It belongs to the seam bar —
  the strip between the two halves that carries game information, as PonyRec's does — and is
  deferred to the slice that adds it.
