<?php

namespace App\Http\Requests;

use App\Enums\Seat;
use App\Models\Game;
use Illuminate\Auth\Access\Response;
use Illuminate\Validation\Rule;

/**
 * The roll winner choosing which seat goes first.
 */
class ElectFirstPlayerRequest extends ActiveSeatRequest
{
    protected function authorizeSeat(Seat $seat, Game $game): Response
    {
        $rollWinner = $game->rollWinner();

        if ($rollWinner === null) {
            return Response::deny('Nobody has rolled for turn order yet.');
        }

        return $seat === $rollWinner ? Response::allow() : Response::deny('Only the roll winner chooses who goes first.');
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
