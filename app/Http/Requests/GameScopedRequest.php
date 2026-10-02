<?php

namespace App\Http\Requests;

/**
 * A request made for one game of the match. It names that game, and is refused
 * with a 409 once the match has moved on to another.
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
        abort_if($this->gameNumber() !== $this->game()->game_number, 409, 'That was for an earlier game.');
    }
}
