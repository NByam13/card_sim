<?php

namespace App\Http\Requests;

use App\Enums\Seat;
use App\Models\Game;
use Illuminate\Auth\Access\Response;
use Illuminate\Validation\Rule;

/**
 * Moving the shared turn cursor: only the acting seat may. `turn_stop` is
 * required for a move and prohibited when the turn is ending.
 */
class AdvanceCursorRequest extends GameScopedRequest
{
    protected function authorizeSeat(Seat $seat, Game $game): Response
    {
        if (! $game->turnOrderDecided()) {
            return Response::deny('Turn order is not decided yet.');
        }

        if ($game->currentGameDecided()) {
            return Response::deny('This game has already been decided.');
        }

        return $seat === $game->actingSeat() ? Response::allow() : Response::deny('It is not your turn.');
    }

    /** @return array<string, mixed> */
    protected function gameRules(): array
    {
        return [
            'turn_stop' => [
                Rule::requiredIf(! $this->endsTurn()),
                Rule::prohibitedIf($this->endsTurn()),
                'nullable',
                'string',
                'max:255',
            ],
            'ends_turn' => ['sometimes', 'boolean'],
        ];
    }

    public function turnStop(): ?string
    {
        return $this->validated('turn_stop');
    }

    public function endsTurn(): bool
    {
        return $this->boolean('ends_turn');
    }
}
