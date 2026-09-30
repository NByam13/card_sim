<?php

namespace Tests\Feature\Games;

use App\Enums\Seat;
use App\Events\TurnAdvanced;
use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * Moving the shared turn cursor.
 *
 * @see documentation/pvp-decoupling/spec.md
 */
class TurnCursorTest extends TestCase
{
    use RefreshDatabase;

    private function as(Seat $seat, Game $game): self
    {
        return $this->withSession(['seat_tokens' => [$game->code => "{$seat->value}-token"]]);
    }

    public function test_the_acting_seat_moves_the_cursor_to_a_stop(): void
    {
        Event::fake([TurnAdvanced::class]);
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided()->onTurn(3, Seat::Guest, 'main')->create();

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/cursor", ['turn_stop' => 'end'])
            ->assertOk()
            ->assertExactJson(['cursor' => ['turn_number' => 3, 'active_seat' => 'guest', 'turn_stop' => 'end']]);

        $game->refresh();
        $this->assertSame(3, $game->turn_number);
        $this->assertSame(Seat::Guest, $game->active_seat);
        $this->assertSame('end', $game->turn_stop);
        Event::assertDispatched(TurnAdvanced::class, fn (TurnAdvanced $event) => $event->broadcastWith() === [
            'cursor' => ['turn_number' => 3, 'active_seat' => 'guest', 'turn_stop' => 'end'],
        ]);
    }

    public function test_the_first_player_opens_turn_one(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided(Seat::Guest)->create();

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/cursor", ['turn_stop' => 'main'])
            ->assertOk()
            ->assertExactJson(['cursor' => ['turn_number' => 1, 'active_seat' => 'guest', 'turn_stop' => 'main']]);
    }

    public function test_ending_the_turn_hands_it_to_the_other_seat(): void
    {
        Event::fake([TurnAdvanced::class]);
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided()->onTurn(1, Seat::Host, 'end')->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/cursor", ['ends_turn' => true])
            ->assertOk()
            ->assertExactJson(['cursor' => ['turn_number' => 2, 'active_seat' => 'guest', 'turn_stop' => null]]);

        $game->refresh();
        $this->assertSame(2, $game->turn_number);
        $this->assertSame(Seat::Guest, $game->active_seat);
        $this->assertNull($game->turn_stop);
        Event::assertDispatched(TurnAdvanced::class);
    }

    public function test_an_unrecognised_stop_key_is_stored_as_given(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided()->onTurn()->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/cursor", ['turn_stop' => 'contact:2 / no such stop'])
            ->assertOk();

        $this->assertSame('contact:2 / no such stop', $game->refresh()->turn_stop);
    }

    public function test_the_idle_seat_cannot_move_the_cursor(): void
    {
        Event::fake([TurnAdvanced::class]);
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided()->onTurn(1, Seat::Host, 'main')->create();

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/cursor", ['ends_turn' => true])
            ->assertForbidden();

        $game->refresh();
        $this->assertSame(1, $game->turn_number);
        $this->assertSame(Seat::Host, $game->active_seat);
        Event::assertNotDispatched(TurnAdvanced::class);
    }

    public function test_the_second_player_cannot_open_the_game(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided(Seat::Host)->create();

        $this->as(Seat::Guest, $game)
            ->postJson("/games/{$game->code}/cursor", ['turn_stop' => 'main'])
            ->assertForbidden();

        $this->assertSame(0, $game->refresh()->turn_number);
    }

    public function test_the_cursor_cannot_move_before_turn_order_is_decided(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderRolled()->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/cursor", ['turn_stop' => 'main'])
            ->assertForbidden();

        $this->assertSame(0, $game->refresh()->turn_number);
    }

    public function test_a_watcher_cannot_move_the_cursor(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided()->onTurn()->create();

        $this->postJson("/games/{$game->code}/cursor", ['turn_stop' => 'end'])->assertForbidden();

        $this->assertSame('main', $game->refresh()->turn_stop);
    }

    public function test_a_stop_is_required_unless_the_turn_is_ending(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided()->onTurn()->create();

        $this->as(Seat::Host, $game)
            ->postJson("/games/{$game->code}/cursor", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('turn_stop');
    }

    public function test_a_move_is_refused_once_the_turn_has_changed_hands(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->turnOrderDecided()->onTurn(1, Seat::Host, 'end')->create();
        $stale = $game->fresh();

        $this->assertTrue($game->advanceCursor(null, true));
        $this->assertFalse($stale->advanceCursor(null, true));

        $game->refresh();
        $this->assertSame(2, $game->turn_number);
        $this->assertSame(Seat::Guest, $game->active_seat);
        $this->assertSame(1, $stale->turn_number);
    }
}
