<?php

namespace Tests\Feature\Games;

use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Holding a seat without an account: what makes a request one of a game's two
 * seats, and what leaves it watching.
 */
class SeatTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_session_carrying_the_token_holds_the_seat(): void
    {
        $game = Game::factory()->hostToken('host-token')->create();

        $this->withSession(['seat_tokens' => [$game->code => 'host-token']])
            ->get("/games/{$game->code}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('seat', 'host'));
    }

    public function test_a_visitor_without_a_token_watches(): void
    {
        $game = Game::factory()->guestToken('guest-token')->create();

        $this->get("/games/{$game->code}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('seat', null)
                ->where('canJoin', false));
    }

    public function test_a_seat_is_given_its_own_deck_to_deal(): void
    {
        $game = Game::factory()->hostToken('host-token')->create();

        $this->withSession(['seat_tokens' => [$game->code => 'host-token']])
            ->get("/games/{$game->code}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('game.deck.name', 'Host deck'));
    }

    public function test_a_watcher_is_given_nobody_deck(): void
    {
        // A deck list is the other player's hand. Hydrating an opponent's cards
        // is the sync slice's job, from the frames they choose to send.
        $game = Game::factory()->guestToken('guest-token')->create();

        $this->get("/games/{$game->code}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('game.deck', null));
    }

    public function test_a_wrong_token_holds_nothing(): void
    {
        $game = Game::factory()->hostToken('host-token')->create();

        $this->withSession(['seat_tokens' => [$game->code => 'not-the-token']])
            ->get("/games/{$game->code}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('seat', null));
    }

    public function test_a_token_for_one_game_holds_nothing_in_another(): void
    {
        $mine = Game::factory()->hostToken('host-token')->create();
        $theirs = Game::factory()->hostToken('their-token')->create();

        $this->withSession(['seat_tokens' => [$mine->code => 'host-token']])
            ->get("/games/{$theirs->code}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('seat', null));
    }

    public function test_seat_token_hashes_never_reach_the_client(): void
    {
        $game = Game::factory()->hostToken('host-token')->guestToken('guest-token')->create();

        $response = $this->withSession(['seat_tokens' => [$game->code => 'host-token']])
            ->get("/games/{$game->code}");

        $response->assertDontSee($game->host_token_hash);
        $response->assertDontSee($game->guest_token_hash);
        // The guest's token is not the host's business either.
        $response->assertDontSee('guest-token');
    }
}
