# Board Sync: Spec

**Status:** Planned.
**Branch:** `feat/board-sync`
**Last updated:** 2026-09-24

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

## Data model

Columns this slice adds to `games`, per the PvP spec's table:

| Column | Type | Why |
| --- | --- | --- |
| `host_state` / `guest_state` | json, nullable | The full compact board, to restore your own half |
| `host_public_state` / `guest_public_state` | json, nullable | The redacted board, to seed the opponent's mirror on reload |
| `host_seq` / `guest_seq` | integer, default 0 | The last saved frame's sequence |

`turn_stop`, `winner_seat` and the scoring columns stay absent until the slices that use them.

## API / routes

**New on this app:**

- `POST /games/{code}/sync` — relay a redacted frame to the rest of the table. Seat from the
  session, `toOthers`, no write.
- `POST /games/{code}/state` — debounced durable save.
- `GET /cards/{number}` — the cached card lookup. Not under `/games`: it is catalogue data, not
  game data, and the cache is shared across games.

**New on PonyRec:** a fetch-by-number card endpoint, public and throttled like
`GET /api/decks/{code}`, returning `DeckCardResource`. Its own PR in that repo, first, the way
`card_text` was.

**New event:** `BoardStateUpdated`, on the existing `game.{code}` presence channel, carrying the
server-stamped seat.

## Layout

```
resources/js/board/sync/
  types.ts        PublicState, WireInstance, StateFrame, FrameCursor, HIDDEN_ZONES
  redact.ts       the choke point
  acceptFrame.ts  frame ordering
  persist.ts      compactState / expandState
  useMirror.ts    a mirror from frames, with onCardLookup injected
  useGameSync.ts  the channel binding: send, receive, announce
```

`board/mlp/MlpTable.tsx` gains a read-only mirrored rendering. Per the audit, this is the file that
stops existing once the setup module lands — a second hand-mirrored copy is the largest drift risk
there is, so the mirror is a mode of the same component, never a second component.

## Open questions

- **Whose shuffle is authoritative?** Deferred here by the local-board spec. Both seats deal their
  own deck from their own snapshot and neither needs the other's, so it may simply not arise until
  a rules-affecting action does.
- **What does "restart" mean with two seats?** Solo it re-deals. With an opponent it is a desync or
  a rematch. Ported as-is for now, and the rematch reading belongs to the scoring slice.
- **Does the mirror need its own zoom?** Your half and their half are separate scroll areas at the
  same scale today. Two zoom controls may be one too many.
- **How stale is too stale?** A seat that closes its tab leaves a mirror frozen at its last frame,
  and presence already knows they are gone. Whether that should be said on screen, and how loudly,
  is a design question this slice will surface.
