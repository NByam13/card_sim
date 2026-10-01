<?php

namespace App\Http\Requests;

use App\Enums\MatchFormat;
use App\Enums\Seat;
use App\Games\Participant;
use App\Models\Game;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The host choosing Bo1 or Bo3, until the format locks.
 */
class ChangeMatchFormatRequest extends FormRequest
{
    public function authorize(): Response
    {
        $game = $this->route('game');

        if (! $game instanceof Game || Participant::fromRequest($this)?->roleIn($game) !== Seat::Host) {
            return Response::deny('Only the host can choose the match format.');
        }

        return $game->formatLocked() ? Response::deny('The match format is locked.') : Response::allow();
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'format' => ['required', Rule::enum(MatchFormat::class)],
        ];
    }

    public function matchFormat(): MatchFormat
    {
        return MatchFormat::from($this->validated('format'));
    }
}
