<?php

namespace App\Http\Controllers;

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
        $participant = $request->user();
        $seat = $participant?->roleIn($game);
        $token = $participant?->seatTokens[$game->code] ?? null;

        return Inertia::render('games/show', [
            'game' => $this->payload($game, $seat),
            'seat' => $seat,
            // Only ever sent to the seat it belongs to: it *is* that seat.
            'resumeUrl' => $seat === null || $token === null ? null : route('games.resume', [
                'game' => $game,
                'token' => $token,
            ]),
            'inviteUrl' => route('games.show', $game),
            'canJoin' => $seat === null && $game->guestSeatOpen(),
        ]);
    }

    /** Take the open guest seat. */
    public function join(Game $game, ClaimSeatRequest $request): RedirectResponse
    {
        $participant = $request->user();

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
     * Adopt a seat in this browser from a resume link.
     *
     * The token in the URL is the seat's secret, so holding the link is the
     * proof. A wrong one leaves the browser a watcher rather than erroring:
     * there is nothing useful to tell someone who mistyped a secret.
     */
    public function resume(Game $game, string $token, Request $request): RedirectResponse
    {
        $this->seating->resume($request, $game, $token);

        return to_route('games.show', $game);
    }

    /** Cancel a game nobody joined. Host only, and only while waiting. */
    public function destroy(Game $game, Request $request): RedirectResponse
    {
        $participant = $request->user();

        abort_if($participant?->roleIn($game) !== 'host', 403, 'Only the host can cancel this game.');
        abort_if($game->status !== 'waiting', 403, 'This game has already started.');

        $game->delete();
        ParticipantSession::forget($request, $game->code);

        Log::info('game.cancelled', ['game' => $game->code]);

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
