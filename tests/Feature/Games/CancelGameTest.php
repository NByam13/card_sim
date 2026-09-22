<?php

namespace Tests\Feature\Games;

use App\Events\GameCancelled;
use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
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

    public function test_cancelling_tells_everyone_still_on_the_page(): void
    {
        // Otherwise they keep being offered a seat that cannot be claimed, and
        // find out when the join comes back a bare 404.
        Event::fake([GameCancelled::class]);
        $game = Game::factory()->hostToken('host-token')->create();

        $this->withSession(['seat_tokens' => [$game->code => 'host-token']])
            ->delete("/games/{$game->code}");

        Event::assertDispatched(
            GameCancelled::class,
            fn (GameCancelled $event) => $event->code === $game->code
        );
    }

    public function test_a_refused_cancel_tells_nobody(): void
    {
        Event::fake([GameCancelled::class]);
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();

        $this->withSession(['seat_tokens' => [$game->code => 'guest-token']])
            ->delete("/games/{$game->code}");

        Event::assertNotDispatched(GameCancelled::class);
    }

    public function test_the_cancelled_broadcast_reaches_the_game_channel(): void
    {
        $event = new GameCancelled('abcdefabcdef');

        $this->assertSame('presence-game.abcdefabcdef', $event->broadcastOn()[0]->name);
        $this->assertSame(['code' => 'abcdefabcdef'], $event->broadcastWith());
    }

    public function test_the_host_is_offered_the_cancel_button_only_while_waiting(): void
    {
        $waiting = Game::factory()->hostToken('host-token')->create();

        $this->withSession(['seat_tokens' => [$waiting->code => 'host-token']])
            ->get("/games/{$waiting->code}")
            ->assertInertia(fn ($page) => $page->where('canCancel', true));

        $started = Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();

        $this->withSession(['seat_tokens' => [$started->code => 'host-token']])
            ->get("/games/{$started->code}")
            ->assertInertia(fn ($page) => $page->where('canCancel', false));
    }

    public function test_nobody_but_the_host_is_offered_the_cancel_button(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();

        $this->withSession(['seat_tokens' => [$game->code => 'guest-token']])
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page->where('canCancel', false));

        $this->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page->where('canCancel', false));
    }
}
