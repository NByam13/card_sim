<?php

namespace App\Games;

use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * The session side of a participant: the browser's opaque id, and the seat
 * tokens it is holding.
 *
 * Session-scoped rather than per-connection on purpose. Two tabs from one
 * browser are one presence member and one seat, so refreshing never reads as a
 * second watcher arriving or a seat being taken twice.
 */
final class ParticipantSession
{
    private const ID_KEY = 'participant_id';

    private const SEATS_KEY = 'seat_tokens';

    /**
     * Ids are prefixed so they can never collide with anything else that shares
     * the `id` field of a presence member set.
     */
    private const PREFIX = 'v:';

    /**
     * Read this request's participant, minting an id if it does not have one.
     *
     * Minting here is safe in a way PonyRec's spectator guard could not be: an
     * id on its own grants nothing at all. Holding a *seat* still requires a
     * token that only `remember()` puts there, and that only a successful claim
     * or a valid resume link produces.
     */
    public static function resolve(Request $request): ?Participant
    {
        if (! $request->hasSession()) {
            return null;
        }

        $session = $request->session();
        $id = $session->get(self::ID_KEY);

        if (! is_string($id) || ! str_starts_with($id, self::PREFIX)) {
            $id = self::PREFIX.Str::uuid()->toString();
            $session->put(self::ID_KEY, $id);
        }

        $tokens = $session->get(self::SEATS_KEY, []);

        return new Participant($id, is_array($tokens) ? $tokens : []);
    }

    /** Hold a seat in this browser: the plaintext token, kept only here. */
    public static function remember(Request $request, string $gameCode, string $token): void
    {
        $tokens = $request->session()->get(self::SEATS_KEY, []);
        $tokens = is_array($tokens) ? $tokens : [];
        $tokens[$gameCode] = $token;

        $request->session()->put(self::SEATS_KEY, $tokens);
    }

    /** Give up a seat, used when the game it belongs to is gone. */
    public static function forget(Request $request, string $gameCode): void
    {
        $tokens = $request->session()->get(self::SEATS_KEY, []);

        if (is_array($tokens) && array_key_exists($gameCode, $tokens)) {
            unset($tokens[$gameCode]);
            $request->session()->put(self::SEATS_KEY, $tokens);
        }
    }
}
