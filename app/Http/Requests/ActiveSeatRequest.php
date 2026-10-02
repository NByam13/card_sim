<?php

namespace App\Http\Requests;

use App\Enums\GameStatus;
use App\Enums\Seat;
use App\Games\Participant;
use App\Models\Game;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use LogicException;

/**
 * A request from a seat in a game with both seats taken. The seat is always
 * derived from the session, never read from the input.
 *
 * Subclasses add their own checks in `authorizeSeat()`.
 */
class ActiveSeatRequest extends FormRequest
{
    protected string $notSeated = 'Only a seated player can do that.';

    protected string $notActive = 'Both seats need to be taken first.';

    /** @var list<GameStatus> The game statuses this request is allowed in. */
    protected array $statuses = [GameStatus::Active];

    public function authorize(): Response
    {
        $seat = $this->heldSeat();

        if ($seat === null) {
            return Response::deny($this->notSeated);
        }

        if (! in_array($this->game()->status, $this->statuses, true)) {
            return Response::deny($this->notActive);
        }

        return $this->authorizeSeat($seat, $this->game());
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }

    public function game(): Game
    {
        $game = $this->route('game');

        return $game instanceof Game ? $game : throw new LogicException('The route has no game.');
    }

    /** The caller's seat. Only called once the request is authorized. */
    public function seat(): Seat
    {
        return $this->heldSeat() ?? throw new LogicException('The caller holds no seat.');
    }

    /** Checks beyond holding a seat in an active game. */
    protected function authorizeSeat(Seat $seat, Game $game): Response
    {
        return Response::allow();
    }

    private function heldSeat(): ?Seat
    {
        return Participant::fromRequest($this)?->roleIn($this->game());
    }
}
