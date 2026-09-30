<?php

namespace App\Http\Controllers;

use App\Enums\Seat;
use App\Events\GameCancelled;
use App\Events\MatchAccepted;
use App\Games\Participant;
use App\Games\ParticipantSession;
use App\Games\PonyRec\DeckClient;
use App\Games\PonyRec\DeckImportFailed;
use App\Games\Seating;
use App\Http\Requests\AcceptMatchRequest;
use App\Http\Requests\CancelGameRequest;
use App\Http\Requests\ClaimSeatRequest;
use App\Models\Game;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

/**
 * A game's lifecycle up to the point people start playing: open one, take its
 * seats, watch it, leave it.
 *
 * Nobody signs in. A seat is a token this browser's session holds, so every
 * "who is this" question goes through the request's {@see Participant}, and the
 * seat is always derived server-side — never read from the request body.
 *
 * @see documentation/anonymous-games/spec.md
 */
class GameController extends Controller
{
    public function __construct(
        private readonly Seating $seating,
        private readonly DeckClient $decks,
    ) {}

    /** Open a game and take its host seat. */
    public function store(ClaimSeatRequest $request): RedirectResponse
    {
        $code = $request->deckCode();

        try {
            $deck = $this->decks->fetch($code);
        } catch (DeckImportFailed $e) {
            return back()->withInput()->withErrors(['deck_code' => $e->getMessage()]);
        }

        $game = $this->seating->open($request, 'mlp', $deck, $code, $request->displayName());

        return to_route('games.show', $game);
    }

    /** The game itself: a lobby for a seat, a mirror for anyone else. */
    public function show(Game $game, Request $request): Response
    {
        $seat = Participant::fromRequest($request)?->roleIn($game);

        return Inertia::render('games/show', [
            'game' => $this->payload($game, $seat),
            'seat' => $seat?->value,
            'cursor' => $game->phaseState($seat),
            'turnOrder' => $game->turnOrder(),
            // The same link for both jobs: it offers the free seat while one is
            // open, and brings spectators in once the game is full.
            'inviteUrl' => route('games.show', $game),
            'canJoin' => $seat === null && $game->guestSeatOpen(),
            // The same rule `destroy()` enforces, so the button is only ever
            // offered where the request behind it would be allowed.
            'canCancel' => $seat === Seat::Host && $game->status === 'waiting',
        ]);
    }

    /** Take the open guest seat. */
    public function join(Game $game, ClaimSeatRequest $request): RedirectResponse
    {
        $participant = Participant::fromRequest($request);

        if ($participant?->holdsSeatIn($game)) {
            return back()->withErrors(['deck_code' => 'You are already seated in this game.']);
        }

        if (! $game->guestSeatOpen()) {
            return back()->withErrors(['deck_code' => 'This game is full.']);
        }

        $code = $request->deckCode();

        try {
            $deck = $this->decks->fetch($code);
        } catch (DeckImportFailed $e) {
            return back()->withInput()->withErrors(['deck_code' => $e->getMessage()]);
        }

        // Deliberately after the import: a deck that never loaded must not cost
        // someone the seat, and the conditional claim inside settles the race
        // between two people joining at once.
        if (! $this->seating->claimGuestSeat($request, $game, $deck, $code, $request->displayName())) {
            return back()->withErrors(['deck_code' => 'Someone else just took that seat.']);
        }

        return to_route('games.show', $game);
    }

    /**
     * Accept the match: this seat is ready to play the other one.
     *
     * A seat arriving from the lobby calls this on arrival, having no board to
     * lose. A seat playing alone calls it when the player says so. The board is
     * re-dealt in the browser either way — the server only records the answer
     * and tells the other seat.
     */
    public function accept(Game $game, AcceptMatchRequest $request): RedirectResponse
    {
        $seat = $request->seat();

        $game->acceptFor($seat);

        MatchAccepted::dispatch($game->refresh(), $seat);

        // A full re-render on purpose: the board deals fresh from props that no
        // longer carry a saved state, which is what accepting means.
        return to_route('games.show', $game);
    }

    /** Cancel a game nobody joined. Host only, and only while waiting. */
    public function destroy(Game $game, CancelGameRequest $request): RedirectResponse
    {
        $game->delete();
        ParticipantSession::forget($request, $game->code);

        Log::info('game.cancelled', ['game' => $game->code]);

        // Anyone else on the page is now looking at a game that is gone, and
        // would find out by having a join refused with a bare 404.
        GameCancelled::dispatch($game->code);

        return to_route('home');
    }

    /**
     * What both seats and watchers may know about a game.
     *
     * A seat gets its own deck snapshot, because its board is dealt from it in
     * the browser. It never gets the other seat's: that is the opponent's hand,
     * and hydrating their cards is the sync slice's job, from the frames they
     * choose to send.
     *
     * @return array<string, mixed>
     */
    private function payload(Game $game, ?Seat $seat): array
    {
        return [
            'code' => $game->code,
            'setup' => $game->setup,
            'status' => $game->status,
            'seats' => [
                Seat::Host->value => [
                    'name' => $game->nameFor(Seat::Host),
                    'deck_name' => $game->deckNameFor(Seat::Host),
                    'claimed' => true,
                ],
                Seat::Guest->value => [
                    'name' => $game->guest_token_hash ? $game->nameFor(Seat::Guest) : null,
                    'deck_name' => $game->deckNameFor(Seat::Guest),
                    'claimed' => $game->guest_token_hash !== null,
                ],
            ],
            'you' => $seat?->value,
            // Which seats are ready to play each other. A seat playing alone has
            // accepted nothing, and boards are only relayed once both have.
            'accepted' => $game->acceptance(),
            // Null for a watcher, who has no board of their own to deal.
            'deck' => $seat ? $game->deckFor($seat) : null,
            'saved_state' => $seat ? $game->stateFor($seat) : null,
            // The opponent's redacted board, so their mirror is not blank until
            // they next move. Already stripped of everything hidden by the
            // browser that saved it; this only passes it on. Withheld until the
            // match is live, on the same rule the relay follows: a board played
            // alone is nobody else's business.
            'opponent_state' => $seat && $game->matchIsLive()
                ? $game->publicStateFor($seat->opposing())
                : null,
        ];
    }
}
