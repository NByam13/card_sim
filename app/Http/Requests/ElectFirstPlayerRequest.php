<?php

namespace App\Http\Requests;

use App\Enums\Seat;
use App\Models\Game;
use Illuminate\Auth\Access\Response;
use Illuminate\Validation\Rule;

/**
 * The seat entitled to it choosing which seat goes first: the roll winner in
 * game 1, the loser of the last game after it.
 */
class ElectFirstPlayerRequest extends ActiveSeatRequest
{
    protected function authorizeSeat(Seat $seat, Game $game): Response
    {
        $chooser = $game->turnOrderChooser();

        if ($chooser === null) {
            return Response::deny('Nobody has rolled for turn order yet.');
        }

        if ($seat === $chooser) {
            return Response::allow();
        }

        return Response::deny($game->isFirstGame()
            ? 'Only the roll winner chooses who goes first.'
            : 'Only the loser of the last game chooses who goes first.');
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'first_player' => ['required', Rule::enum(Seat::class)],
        ];
    }

    public function firstPlayer(): Seat
    {
        return Seat::from($this->validated('first_player'));
    }
}
