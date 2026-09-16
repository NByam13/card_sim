<?php

namespace App\Games;

use App\Models\Game;
use Illuminate\Contracts\Auth\Authenticatable;

/**
 * Whoever is making this request, as far as the broadcaster is concerned.
 *
 * There are no accounts here, but the transport insists on somebody: presence
 * channels are guarded, and `PusherBroadcaster::auth()` rejects a subscriber
 * whose user cannot be resolved before the channel callback ever runs. This is
 * the smallest thing that answers to `Authenticatable`.
 *
 * It is an opaque id plus the seat tokens this browser's session is carrying.
 * The id identifies a *browser*, not a person: two tabs share it, so they count
 * once in a presence set, and nothing about it is stable across devices or
 * survives clearing site data. Roles are never carried — `roleIn()` derives one
 * per game from a token, so a client cannot claim a seat by asserting it.
 *
 * @see ParticipantSession for where the id and tokens come from.
 */
final readonly class Participant implements Authenticatable
{
    /**
     * @param  string  $id  Opaque per-session id, `v:` prefixed.
     * @param  array<string, string>  $seatTokens  Game code => seat token.
     */
    public function __construct(
        public string $id,
        public array $seatTokens = [],
    ) {}

    /** The seat this participant holds in a game, or null when watching. */
    public function roleIn(Game $game): ?string
    {
        return $game->seatFor($this->seatTokens[$game->code] ?? null);
    }

    public function holdsSeatIn(Game $game): bool
    {
        return $this->roleIn($game) !== null;
    }

    public function getAuthIdentifierName(): string
    {
        return 'id';
    }

    public function getAuthIdentifier(): string
    {
        return $this->id;
    }

    /**
     * Never used: nothing authenticates *as* a participant, it only carries an
     * identity the session already minted. Returning a name satisfies the
     * contract without implying a credential exists.
     */
    public function getAuthPasswordName(): string
    {
        return 'password';
    }

    public function getAuthPassword(): string
    {
        return '';
    }

    public function getRememberToken(): string
    {
        return '';
    }

    public function setRememberToken($value): void
    {
        // No-op. An identity lives and dies with its session.
    }

    public function getRememberTokenName(): string
    {
        return '';
    }
}
