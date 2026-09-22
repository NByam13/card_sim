<?php

namespace Tests\Feature\Games;

use App\Broadcasting\GameChannel;
use App\Games\Participant;
use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The game channel's authorization: what a subscriber is published as, and when
 * one is refused.
 *
 * This is the slice's authorization boundary. A seat here is decided from the
 * session's token and never from anything the subscriber sends, so these tests
 * ask the question the way the broadcaster does — with a participant, not a
 * payload.
 */
class GameChannelTest extends TestCase
{
    use RefreshDatabase;

    private function participant(string $gameCode, ?string $token = null): Participant
    {
        return new Participant('v:'.fake()->uuid(), $token === null ? [] : [$gameCode => $token]);
    }

    public function test_a_held_host_token_is_published_as_the_host(): void
    {
        $game = Game::factory()->hostToken('host-token')->create(['host_name' => 'Tangent']);
        $participant = $this->participant($game->code, 'host-token');

        $this->assertSame([
            'id' => $participant->id,
            'role' => 'host',
            'name' => 'Tangent',
        ], (new GameChannel)->join($participant, $game));
    }

    public function test_a_held_guest_token_is_published_as_the_guest(): void
    {
        $game = Game::factory()
            ->hostToken('host-token')
            ->guestToken('guest-token')
            ->create(['guest_name' => 'Sam']);
        $participant = $this->participant($game->code, 'guest-token');

        $this->assertSame([
            'id' => $participant->id,
            'role' => 'guest',
            'name' => 'Sam',
        ], (new GameChannel)->join($participant, $game));
    }

    public function test_someone_holding_no_token_watches_anonymously(): void
    {
        $game = Game::factory()->hostToken('host-token')->create(['host_name' => 'Tangent']);
        $participant = $this->participant($game->code);

        $this->assertSame([
            'id' => $participant->id,
            'role' => 'spectator',
            'name' => null,
        ], (new GameChannel)->join($participant, $game));
    }

    public function test_a_wrong_token_watches_rather_than_sits(): void
    {
        // The whole point of deriving the role here: asserting a seat, or
        // guessing at one, gets you exactly what a stranger gets.
        $game = Game::factory()->hostToken('host-token')->create();

        $member = (new GameChannel)->join($this->participant($game->code, 'not-the-token'), $game);

        $this->assertSame('spectator', $member['role']);
    }

    public function test_a_token_for_another_game_watches(): void
    {
        $mine = Game::factory()->hostToken('host-token')->create();
        $theirs = Game::factory()->hostToken('their-token')->create();

        $member = (new GameChannel)->join($this->participant($mine->code, 'host-token'), $theirs);

        $this->assertSame('spectator', $member['role']);
    }

    public function test_a_watcher_is_refused_when_the_game_is_full_of_watchers(): void
    {
        config(['games.max_spectators' => 0]);
        $game = Game::factory()->create();

        $this->assertFalse((new GameChannel)->join($this->participant($game->code), $game));
    }

    public function test_a_seat_is_never_refused_by_the_spectator_cap(): void
    {
        // A player must always be able to reach their own game; the cap bounds
        // an audience and nothing else.
        config(['games.max_spectators' => 0]);
        $game = Game::factory()->hostToken('host-token')->create();

        $member = (new GameChannel)->join($this->participant($game->code, 'host-token'), $game);

        $this->assertSame('host', $member['role']);
    }
}
