<?php

namespace App\Games;

use App\Models\Game;
use Illuminate\Broadcasting\Broadcasters\PusherBroadcaster;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Log;
use Pusher\ApiErrorException;

/**
 * Whether a game has room for another watcher.
 *
 * The count comes from the websocket server rather than a column, because
 * "watching" is a live connection and nothing else knows when one goes away.
 *
 * It counts *members*, not spectators: seats are anonymous here, so a presence
 * id is a browser rather than a person and the server cannot tell from the game
 * row which ids are the two players. The cap is therefore applied as
 * `spectators + claimed seats`, which is exact when both players are connected
 * and lets one extra watcher in while a seat is empty. That slack is worth more
 * than the bookkeeping to remove it — the cap bounds connection use and enforces
 * no rule.
 *
 * Fails **open**: when the server cannot be reached the answer is "there is
 * room". A broken check should never be what stops people watching a game.
 */
final class SpectatorSeats
{
    public static function full(Game $game, ?string $viewerId = null): bool
    {
        $cap = (int) config('games.max_spectators');

        if ($cap <= 0) {
            return true;
        }

        $seats = $game->guest_token_hash !== null ? 2 : 1;

        try {
            return self::members($game, $viewerId) >= $cap + $seats;
        } catch (\Throwable $e) {
            Log::warning('game.spectator_count_failed', [
                'game' => $game->code,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /**
     * Members currently on the game's presence channel, not counting the viewer
     * asking — they are about to be counted by joining.
     *
     * @throws \Throwable when the websocket server cannot be reached
     */
    private static function members(Game $game, ?string $viewerId): int
    {
        $broadcaster = Broadcast::driver();

        if (! $broadcaster instanceof PusherBroadcaster) {
            return 0;
        }

        try {
            $response = $broadcaster->getPusher()->get("/channels/presence-game.{$game->code}/users");
        } catch (ApiErrorException $e) {
            // Nobody has ever subscribed, so the channel does not exist yet.
            if ($e->getCode() === 404) {
                return 0;
            }

            throw $e;
        }

        $users = is_object($response) ? ($response->users ?? []) : ($response['users'] ?? []);

        return collect($users)
            ->map(fn ($user) => is_array($user) ? ($user['id'] ?? null) : ($user->id ?? null))
            ->filter(fn ($id) => is_string($id))
            ->reject(fn (string $id) => $id === $viewerId)
            ->count();
    }
}
