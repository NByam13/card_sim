<?php

namespace App\Http\Controllers;

use App\Events\GameCancelled;
use App\Games\Participant;
use App\Games\ParticipantSession;
use App\Games\PonyRec\DeckClient;
use App\Games\PonyRec\DeckImportFailed;
use App\Games\Seating;
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
            'seat' => $seat,
            // The same link for both jobs: it offers the free seat while one is
            // open, and brings spectators in once the game is full.
            'inviteUrl' => route('games.show', $game),
            'canJoin' => $seat === null && $game->guestSeatOpen(),
            // The same rule `destroy()` enforces, so the button is only ever
            // offered where the request behind it would be allowed.
            'canCancel' => $seat === 'host' && $game->status === 'waiting',
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

    /** Cancel a game nobody joined. Host only, and only while waiting. */
    public function destroy(Game $game, Request $request): RedirectResponse
    {
        $participant = Participant::fromRequest($request);

        abort_if($participant?->roleIn($game) !== 'host', 403, 'Only the host can cancel this game.');
        abort_if($game->status !== 'waiting', 403, 'This game has already started.');

        $game->delete();
        ParticipantSession::forget($request, $game->code);

        Log::info('game.cancelled', ['game' => $game->code]);

        // Anyone else on the page is now looking at a game that is gone, and
        // would find out by having a join refused with a bare 404.
        GameCancelled::dispatch($game->code);

        return to_route('home');
    }

    /**
     * What both seats and watchers may know about a game. Deck snapshots are
     * deliberately not sent yet — no board exists to deal them onto, and a seat's
     * own deck list is not the opponent's business.
     *
     * @return array<string, mixed>
     */
    private function payload(Game $game, ?string $seat): array
    {
        return [
            'code' => $game->code,
            'setup' => $game->setup,
            'status' => $game->status,
            'seats' => [
                'host' => [
                    'name' => $game->nameFor('host'),
                    'deck_name' => $game->deckNameFor('host'),
                    'claimed' => true,
                ],
                'guest' => [
                    'name' => $game->guest_token_hash ? $game->nameFor('guest') : null,
                    'deck_name' => $game->deckNameFor('guest'),
                    'claimed' => $game->guest_token_hash !== null,
                ],
            ],
            'you' => $seat,
        ];
    }
}
