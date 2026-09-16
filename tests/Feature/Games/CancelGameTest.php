<?php

namespace Tests\Feature\Games;

use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Cancelling a game nobody joined.
 */
class CancelGameTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_host_can_cancel_a_game_nobody_joined(): void
    {
        $game = Game::factory()->hostToken('host-token')->create();

        $this->withSession(['seat_tokens' => [$game->code => 'host-token']])
            ->delete("/games/{$game->code}")
            ->assertRedirect('/');

        $this->assertSame(0, Game::count());
    }

    public function test_the_host_cannot_cancel_once_someone_has_joined(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();

        $this->withSession(['seat_tokens' => [$game->code => 'host-token']])
            ->delete("/games/{$game->code}")
            ->assertForbidden();

        $this->assertSame(1, Game::count());
    }

    public function test_the_guest_cannot_cancel(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();

        $this->withSession(['seat_tokens' => [$game->code => 'guest-token']])
            ->delete("/games/{$game->code}")
            ->assertForbidden();
    }

    public function test_a_watcher_cannot_cancel(): void
    {
        $game = Game::factory()->create();

        $this->delete("/games/{$game->code}")->assertForbidden();

        $this->assertSame(1, Game::count());
    }

    public function test_an_unknown_game_is_a_404(): void
    {
        $this->get('/games/nosuchgamexx')->assertNotFound();
    }
}
