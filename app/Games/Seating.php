<?php

namespace App\Games;

use App\Models\Game;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Creating games and claiming their seats.
 *
 * Each claim returns the plaintext seat token exactly once, for the caller to
 * put in the claimant's session. Nothing else can produce it afterwards: the row
 * keeps only a hash.
 */
final class Seating
{
    /** Create a game with its host seat already claimed. */
    public function open(Request $request, string $setup, array $deck, string $deckCode, ?string $name): Game
    {
        $token = Game::newToken();

        $game = Game::create([
            'setup' => $setup,
            'status' => 'waiting',
            'host_token_hash' => Game::hashToken($token),
            'host_name' => $name,
            'host_deck_code' => $deckCode,
            'host_deck' => $deck,
        ]);

        ParticipantSession::remember($request, $game->code, $token);

        Log::info('game.opened', ['game' => $game->code, 'setup' => $game->setup, 'deck' => $deckCode]);

        return $game;
    }

    /**
     * Claim the guest seat, or fail because someone else just did.
     *
     * The conditional update is the whole race guard: two people pressing Join
     * at once both pass the earlier checks, and exactly one of them updates a
     * row that still has an empty guest seat.
     *
     * @param  array<string, mixed>  $deck
     */
    public function claimGuestSeat(Request $request, Game $game, array $deck, string $deckCode, ?string $name): bool
    {
        $token = Game::newToken();

        $claimed = Game::whereKey($game->id)
            ->where('status', 'waiting')
            ->whereNull('guest_token_hash')
            ->update([
                'guest_token_hash' => Game::hashToken($token),
                'guest_name' => $name,
                'guest_deck_code' => $deckCode,
                'guest_deck' => json_encode($deck),
                'status' => 'active',
                'last_activity_at' => now(),
            ]);

        if (! $claimed) {
            Log::warning('game.join_conflict', ['game' => $game->code]);

            return false;
        }

        ParticipantSession::remember($request, $game->code, $token);

        Log::info('game.joined', ['game' => $game->code, 'deck' => $deckCode]);

        return true;
    }

    /**
     * Adopt a seat in this browser from a resume link.
     *
     * The token is the secret, so a link carrying a valid one *is* the seat's
     * proof; there is nothing further to verify. Returns the seat claimed, or
     * null when the token holds none.
     */
    public function resume(Request $request, Game $game, string $token): ?string
    {
        $seat = $game->seatFor($token);

        if ($seat === null) {
            Log::warning('game.resume_rejected', ['game' => $game->code]);

            return null;
        }

        ParticipantSession::remember($request, $game->code, $token);

        Log::info('game.resumed', ['game' => $game->code, 'seat' => $seat]);

        return $seat;
    }
}
