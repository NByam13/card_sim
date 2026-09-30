# PvP Decoupling: Spec

**Status:** In progress. On PonyRec: the `pvp` flag, the deck endpoint and the card endpoint are
built. Here: anonymous games, the local board and board sync are built. Turn order is next.
**Branch:** this repo's `main`; the PonyRec-side work landed on `nbyam13/feature-flags`,
`nbyam13/deck-lookup-endpoint` and PonyRec #172.
**Last updated:** 2026-09-29

This is the plan of record for the whole move, and it lives in the app being built rather than the
one being emptied. It was written in `NByam13/ponyrec` — `documentation/pvp-decoupling/` there —
and moved here on 2026-09-29 with [`board-audit.md`](board-audit.md); paths into PonyRec's own
documentation are named as such below.

The slices that implement it each have their own spec here:
[`anonymous-games`](../anonymous-games/spec.md), [`local-board`](../local-board/spec.md),
[`board-sync`](../board-sync/spec.md).

## Summary

Move the live two-player simulator off PonyRec onto its own app, domain and infrastructure, as a
game-agnostic TCG table that ships with an MLP setup. PonyRec keeps the card database, deck
building and solo playtest, and exposes the deck and card data the table needs. The table is
anonymous: no accounts, no match history.

The board audit that sizes this work is in [`board-audit.md`](board-audit.md).

## Goals

- A community client for playing the MLP TCG online that runs independently of PonyRec: its own
  repo, deploy, domain and database.
- A generic board: zones, actions and phases come from a selectable game setup, and MLP is the first.
- Anyone with a PonyRec deck code can play it, without the game site knowing anything about
  PonyRec accounts.
- PonyRec can switch PvP off at any point during the move (done: the `pvp` flag, recorded in
  `documentation/feature-flags/spec.md` in the PonyRec repo), and drop the code once the new site is
  live.

## Non-goals / out of scope

- **Accounts on the game site.** Anonymous play. Match history and stats are given up with them.
- **OAuth or any sign-in handshake** between the game site and PonyRec.
- **Moving solo playtest.** It stays on PonyRec: it plays against nobody, and it is part of deck
  building.
- **A rules engine.** Same philosophy as today: the table enforces no costs and resolves no
  Exchange. A setup supplies zones, actions and a turn track, not rules.
- **Copying card art.** The game site stores no images (see the bucket decision below).

## Decisions on record

- **New app, new domain, new infrastructure.** Not a subdomain and not a route group on PonyRec.
  Rejected: serving it from PonyRec under another host, which shares everything and separates
  nothing.
- **Its own repo, outside the PonyRec workspace.** Treated as a separate project, not a fourth
  directory in `NByam13/ponyrec`, so the workspace's `setup.sh` and seam docs do not document the
  connection. Its seam with PonyRec is documented on its side; PonyRec documents the deck endpoint
  as a public endpoint without naming a consumer.
- **Stack: Laravel 13, Inertia + React, Reverb, on Laravel Cloud.** The PvP sync design already
  ended at "client POSTs, server broadcasts with a seat it verified" (PON-42), which is Laravel
  events over Reverb, and the server-held dice roll, turn cursor and presence-based spectator cap
  carry over as designs. React 19 and Inertia 3 from the current starter kit, not PonyRec's 18 and
  2, since the generalisation rewrites most of the board anyway. The React Compiler is **off** for
  the port: the board assigns refs during render (`useGameChannel`'s handler ref), which breaks the
  compiler's rules silently rather than loudly. Lint is ESLint with Prettier inside it, as in the
  PonyRec repos, replacing the kit's `vite-plus`.
- **Anonymous players, seated by a session-held secret.** A game is a code in a URL. Claiming a seat
  stores a hashed seat token on the game row and puts the seat in the visitor's session, which
  generalises today's `SpectatorGuard` (a session-issued identity the broadcaster can resolve) to
  players as well as spectators. `/broadcasting/auth`, CSRF and `toOthers` then work unchanged. A
  signed rejoin link reclaims a seat from another device. Rejected: game-site accounts, for the PII,
  privacy policy, password resets and user list they would bring; and a secret in `localStorage`
  sent as a header, which needs a custom broadcasting auth path for no gain. Account linking stays
  possible later as a paste-a-token flow.
- **PonyRec is the deck source; sign-in stays on PonyRec.** A player makes a deck Unlisted on
  PonyRec and pastes its code into the game site, exactly the flow the Tabletop Simulator mod
  already uses against `GET /tts/decks/{code}`. The game site never authenticates with PonyRec.
- **A deck endpoint that carries full card data, not card numbers plus the card API.**
  `GET /api/decks/{code}` returns each zone's cards as complete card objects, the Main Character
  and the deck's tokens (contract: `documentation/deck-lookup-api/api.md` in the PonyRec repo).
  Rejected: resolving card data through `GET /api/cards`, which is a capped DSL search (at most 10
  results) behind the bot's token, not a fetch by number, and lacks `story_stage` and
  `card_back_url`, both of which the board reads. PonyRec still owns all card data, so the game
  site constructs no card URLs and hard-codes no card facts, the same rule the bot and the mod
  follow. Cards are identified by `card_number`; no PonyRec id crosses the seam, and today's
  `WireInstance.cardId` becomes a card number or an index into the game's own snapshot.
- **The game site's server calls PonyRec, once per seat.** When a player claims a seat, the game
  server fetches the deck and snapshots it onto the game row. A deck edited or made private
  mid-match cannot break the game (the reason today's deck foreign keys null on delete), hydrating
  the opponent's cards is served from the snapshot rather than a second PonyRec call (today's
  `GameController::cards`), and PonyRec's logs record one server rather than every player.
  Rejected: the player's browser calling PonyRec, which needs CORS and puts every player's address
  in PonyRec's logs.
- **The deck endpoint is public and throttled per IP.** No token, like `/tts/decks`: it serves only
  decks their owners already made visible. Rejected: a second bearer token on `VerifyApiToken`,
  which would put a named consumer in PonyRec's config. The cost is that one server shares one
  limit, sized at 60/min by default, far above what the table's Reverb connection cap allows.
- **Generic board, MLP as a setup.** Zones, their visibility and layout, the action set, keyboard
  bindings, the turn track and the win prompt come from a selected game setup. MLP is the first and,
  for now, only one.
- **Port to parity first, then generalise.** Deliberately departs from doing both at once. The board
  moves over still typed against MLP until two browsers play a full match on the new site, with its
  tests, which is also what lets `pvp` switch off here. The setup-module generalisation the audit
  describes follows, with those tests as the safety net. Rejected: generalising while moving, which
  rewrites ~5,200 lines with nothing working to compare against.
- **Card art is hotlinked from PonyRec's bucket.** The game site's `<img>` tags point at the image
  URLs the PonyRec API returns, and the player's browser loads them from PonyRec's bucket. Accepted
  knowingly: this is the most visible link between the two sites, since the URLs sit in the game
  site's pages and the bucket's access logs carry the game site as referrer. Rejected: a copy of the
  art in the game site's own bucket, which would sever that link at the cost of a sync step and a
  second copy of the art.
- **Staged cutover, PvP flag first.** Build and verify the new site, switch `pvp` off on PonyRec,
  then remove the PvP code from PonyRec in a later PR.

## Data model

Nothing new on PonyRec beyond the deck endpoint. After cutover PonyRec can drop: the `games` table,
the user columns `pvp_tutorial_dismissed_at` and `pvp_contact_hint_dismissed_at`, and Reverb
entirely, since every broadcast event in the app today is a PvP event.

The game site owns its own game state. The current `games` row is a reasonable starting shape with
these changes:

| Today | On the game site |
| --- | --- |
| `host_user_id` / `guest_user_id` | `host_token_hash` / `guest_token_hash`, plus a typed display name (presence shows usernames today) |
| `host_deck_id` / `guest_deck_id` | `*_deck_code` plus a `*_deck` JSON snapshot of the deck endpoint's response |
| `phase` + `contact_lane` | one opaque `turn_stop` (e.g. `contact:2`), validated by the clients' shared setup |
| `winner_user_id` | `winner_seat` |
| — | `setup` (`mlp`) |
| the user tutorial columns | `localStorage` on the game site |

## UX / UI

To be designed in the new repo. On PonyRec, once the site exists: the Play a Friend entry points
become links out to it, or disappear. That is an open question, since a prominent link is also a
visible connection.

## API / routes / backend surface

- **New on PonyRec:** `GET /api/decks/{code}`, public, throttled by `ponyrec-decks`
  (`PONYREC_DECKS_RATE_LIMIT`, default 60/min per IP). Contract:
  `documentation/deck-lookup-api/api.md` in the PonyRec repo. Separate from
  `TtsController::deck`, which keeps its shape: the mod is a Workshop item that cannot be rolled
  back, so it is not generalised in place.
- **Removed from PonyRec after cutover:** `/play`, every `/games` route, the `game.{game}` channel,
  `GameController`, `PlayController`, `Game`, the `App\Games` and spectator auth classes, the Game
  events, and the multiplayer-only frontend (`Components/Games`, `decks/playtest/multiplayer`,
  `games/`). Solo playtest keeps `Components/Decks/Playtest` and the reducer.

## Open questions

- **Does solo playtest freeze?** After the fork the two boards drift. The options are to accept the
  fork (PonyRec's solo board gets fixes only), to share a package (which publicly links the repos),
  or to drop solo playtest later. The audit recommends accepting the fork.
- **What do PonyRec's Play a Friend entry points become:** a link to the new site, or nothing?
- **Game setups as code or as data?** The audit recommends TypeScript modules, not a config format.
- **The game site's domain.** Undecided; `card_sim` is a working name.
