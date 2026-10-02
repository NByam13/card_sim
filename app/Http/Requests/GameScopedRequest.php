<?php

namespace App\Http\Requests;

/**
 * A request made for one game of the match. It names that game, and the match
 * when the caller knows it, and is refused with a 409 once the row has moved on
 * to another of either.
 *
 * Subclasses add their own rules in `gameRules()`.
 */
abstract class GameScopedRequest extends ActiveSeatRequest
{
    /** @return array<string, mixed> */
    final public function rules(): array
    {
        return [
            'game_number' => ['required', 'integer', 'min:1'],
            'match_number' => ['sometimes', 'integer', 'min:1'],
            ...$this->gameRules(),
        ];
    }

    /** The game the caller made this request in. */
    public function gameNumber(): int
    {
        return (int) $this->validated('game_number');
    }

    /** @return array<string, mixed> */
    protected function gameRules(): array
    {
        return [];
    }

    protected function passedValidation(): void
    {
        $game = $this->game();
        $matchNumber = $this->validated('match_number');

        abort_if(
            $this->gameNumber() !== $game->game_number || ($matchNumber !== null && (int) $matchNumber !== $game->match_number),
            409,
            'That was for an earlier game.',
        );
    }
}
