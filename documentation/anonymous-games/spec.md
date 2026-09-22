# Anonymous Games: Spec

**Status:** In progress
**Branch:** `feat/anonymous-games`
**Last updated:** 2026-09-22

## Summary

The server side of a game before anyone plays a card: creating a game, claiming one of its two
seats without an account, importing a deck from PonyRec by code, and being present on the game's
channel. It stops short of turn order, board sync and scoring, which are the next slices.

This is the first piece of the PvP decoupling. The PonyRec-side plan and the decisions this
inherits are in that repo's `documentation/pvp-decoupling/spec.md`; the deck endpoint's contract is
`documentation/deck-lookup-api/api.md` there.

## Goals

- Two people with a link can take the two seats of a game, with no accounts and no sign-in.
- A seat survives a page refresh and a browser restart. Moving it to another device is out
  of scope for now.
- A game carries the decks it is played with, so PonyRec being slow, down, or the deck being
  edited mid-match cannot break a game in progress.
- Nothing about the MLP game is encoded here: the row names a setup, and that is all.

## Non-goals for this slice

Nothing happens when the second seat fills, and that is the slice's edge: the row flips to
`active`, both players see each other, and there is no board to deal onto yet.

Turn order and the shared turn cursor, the board and its sync/persist endpoints, best-of-three
scoring, pruning, and any UI beyond what is needed to create a game, claim a seat and see who is
here. All of those are designed in the PonyRec spec and land next.

## Decisions on record

### A seat is a secret in the session, not an account

Claiming a seat mints a 32-byte random token. Its SHA-256 hash is stored on the game row; the
token itself goes into the visitor's session, keyed by game code. A request holds a seat when its
session carries a token whose hash matches one of the row's two.

- **Why hashed:** the row is the thing an attacker would have to reach, and a leaked database
  should not hand out live seats. SHA-256 rather than bcrypt because this is a 256-bit random
  token, not a password: there is nothing to brute-force, and per-request bcrypt cost would be
  paid on every action. Comparison is `hash_equals`.
- **Why the session rather than `localStorage` plus a header:** presence channels need an
  `Authenticatable` before the channel callback runs, so a session-held identity makes
  `/broadcasting/auth`, CSRF and `toOthers` work unchanged. A header-carried token needs a custom
  broadcasting auth path for no gain.
- **Precedent:** PonyRec already does exactly this for spectators (`SpectatorGuard` /
  `SpectatorIdentity`). This generalises it to players.

### Identity on the wire

`App\Games\Participant` is the `Authenticatable` a request carries: an opaque id, plus the seat
tokens this browser's session holds.

The id is `v:{uuid}`, minted once per session and **the same whichever game you are looking at**.
It identifies a browser, not a person and not a seat: two tabs share it, so they are one presence
member, and it says nothing about who you are. The role is not part of the identity — it is
derived per game by matching a held token against that game's two hashes, so a participant can be
a player in one game and a watcher in another with one id.

A presence member publishes that id, the role derived for this game, and a seat's display name —
never a token, and nothing about a watcher beyond the id. The **role is decided server-side from
the session**, never from a field the client sends: the same rule PON-42 forced on PonyRec.

One consequence, recorded because it shapes `SpectatorSeats`: the server cannot tell from a game
row which presence ids are its two players, the way PonyRec could with user ids. So the cap counts
channel members and allows `spectators + claimed seats`, which is exact when both players are
connected and lets one extra watcher in while a seat sits empty.

### Rejoining from another device is out of scope

A resume link — `/games/{code}/resume/{token}`, putting the token into another browser's session —
was built and then removed on 2026-09-22. Nothing about a seat needs it yet, and a page handing
out its own secret is a thing to design once rather than carry along unused. The seat still
survives a refresh and a browser restart, because the session cookie does. If it comes back, it
comes back with the sharing question answered: `git show 2cd6527` has the original.

### Decks are imported once and snapshotted

Claiming a seat takes a PonyRec deck code. The server calls `GET /api/decks/{code}` and stores the
response on the row (`host_deck`, `guest_deck`), alongside the code.

- **Why the server calls, not the browser:** no CORS, one address in PonyRec's logs rather than
  every player's, and it is the only way to snapshot.
- **Why snapshot:** a deck edited, renamed or made private mid-match cannot change or break a game
  in progress. It also means opponent-card hydration is served from our own row rather than a
  second PonyRec call.
- **Failure mapping**, since these are the errors a player will actually hit:

| From PonyRec | Player sees |
| --- | --- |
| 404 `deck.private` | "That deck is private. Set it to Unlisted on PonyRec, then try again." |
| 404 `deck.not_found` | "No deck has that code. Check it was copied in full." |
| 429, timeout, 5xx | "PonyRec didn't answer. Try again in a moment." |

Import failures never create a half-formed seat: the claim is refused and the seat stays open.

### The game row

One row is a match. Columns this slice needs:

| Column | Notes |
| --- | --- |
| `code` | 12-char random, the invite link's id. |
| `setup` | `mlp` today. Names the rule set; nothing else here knows the game. |
| `status` | `waiting` → `active` → `finished`. |
| `host_token_hash` / `guest_token_hash` | The seat secrets. Guest's is null until claimed. |
| `host_name` / `guest_name` | Optional display names, defaulting to "Host" / "Guest". No PII asked for. |
| `host_deck_code` / `guest_deck_code` | The PonyRec codes, kept for display and re-import. |
| `host_deck` / `guest_deck` | JSON snapshots of the deck endpoint's response. |
| `last_activity_at` | Indexed; what pruning will read. |

Later slices add turn order, the opaque `turn_stop`, the state columns, scoring and `winner_seat`.
They are deliberately not migrated ahead of use.

### Cancelling is announced, not just done

The host may cancel a game nobody joined, from a button on the game page that asks a second time
before it goes. Deleting the row then broadcasts `GameCancelled`, and a page that hears it stops
showing a lobby and says so.

Leaving quietly is the `SeatClaimed` problem one step worse: the row is gone, so anyone still on
the page is being offered a seat that cannot be claimed, and finds out when their join comes back
a bare 404. The event carries the code rather than the game, because by the time it is heard there
is nothing to load.

### Seat rules

The same rules as PonyRec's `GamePolicy`, with the user swapped for the seat: anyone with the link
may view; only a `waiting` game with an empty guest seat may be joined; someone already seated
cannot take the other one as well; only the host may cancel, and only while nobody has joined.

They live on `Game` (`guestSeatOpen()`, `seatFor()`) and in `GameController`, **not** in a Laravel
policy. A policy resolves an ability against a user, and there is no user here — "who you are" is
per game, derived from a token, so the indirection would buy nothing. A refused join comes back as
an error on the deck-code field the player is looking at rather than a 403 page; cancelling is a
403, because only a crafted request can reach it.

### What the starter kit leaves behind

The `users` table, `User` model, `UserFactory` and the `App.Models.User` broadcast channel are
removed: this app has no accounts, and a stray auth scaffold invites code that assumes one. The
`sessions` table stays — the seat lives in it — as does `config/auth.php`, reduced to what a
guard-less app needs.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /` | Create a game, or paste a code to join one. |
| `POST /games` | Create a game and claim the host seat (deck code + optional name). |
| `GET /games/{code}` | The game: waiting room for a seat, or a watcher's view. |
| `POST /games/{code}/join` | Claim the guest seat (deck code + optional name). |
| `DELETE /games/{code}` | Host cancels a game nobody joined. |

Channel: `presence-game.{code}`, authorized from the session-held seat, refusing a spectator when
the game is full of watchers (cap configurable, as on PonyRec). The decision lives in
`App\Broadcasting\GameChannel` rather than a closure in `routes/channels.php`: it is the slice's
authorization boundary — the one place a subscriber becomes a `host`, a `guest` or a watcher — and
a closure in a route file has nowhere to be called from. `GameChannelTest` calls it directly.

One link does both jobs: `GET /games/{code}` offers the free seat while one is open, and shows the
game to a watcher once both are taken. The game page keeps it visible, with a copy button, for
that second job.

### Who is seated is told, not inferred

Claiming the guest seat broadcasts `SeatClaimed` on the game's channel, and a page that hears it
re-asks the server for the game.

Presence cannot carry this on its own. A member set says who is *connected*; the seats come from
the row, and every page is holding a copy of it from when it loaded. Without the event the host
watched a player arrive as a nameless member while the seat beside them still read "Empty".

The event names the seat and nothing else — a nudge to re-ask, not a copy of the game — so a page
still only learns what `show()` would tell it, with the seat derived from its own session.

It is `ShouldBroadcastNow` and `ShouldRescue`: immediate, because a lobby that updates a queue
worker later is the bug this fixes, and rescued, because Reverb being down must not turn a claimed
seat into a failed join.

The other half of the same bug is client-side. A subscription is authorized once, when it is made,
so the browser that opens a game as a watcher and *then* takes a seat stays a watcher on the
channel — to the room and to itself. The game page keys its presence component on the seat, so
claiming one remounts it and the channel is subscribed, and re-authorized, again.

## Open questions

- **Spectator cap.** PonyRec's four-per-game is sized against its Reverb tier. This app's tier
  isn't chosen yet, so the cap is config with the same default.
- **Abuse limits.** `POST /games` and the join route are throttled at 10 a minute per IP, which is
  a guess: each one costs a PonyRec deck fetch, and the real number waits until there is traffic
  to size it against.
- **Display names.** Free text today. If that turns out badly, the fallback is seat labels only.
