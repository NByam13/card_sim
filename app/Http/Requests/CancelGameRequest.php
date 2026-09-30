<?php

namespace App\Http\Requests;

use App\Enums\Seat;
use App\Games\Participant;
use App\Models\Game;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Cancelling a game nobody joined. Host only, and only while waiting.
 */
class CancelGameRequest extends FormRequest
{
    public function authorize(): Response
    {
        $game = $this->route('game');

        if (! $game instanceof Game || Participant::fromRequest($this)?->roleIn($game) !== Seat::Host) {
            return Response::deny('Only the host can cancel this game.');
        }

        return $game->status === 'waiting' ? Response::allow() : Response::deny('This game has already started.');
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }
}
