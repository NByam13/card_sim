<?php

namespace Tests\Feature\Games;

use App\Models\Game;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Holding a seat without an account: who a request is, and how a seat moves to
 * another browser.
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
                ->where('resumeUrl', null)
                ->where('canJoin', false));
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

    public function test_a_resume_link_moves_the_seat_into_this_browser(): void
    {
        $game = Game::factory()->hostToken('host-token')->create();

        $this->get("/games/{$game->code}/resume/host-token")
            ->assertRedirect("/games/{$game->code}")
            ->assertSessionHas('seat_tokens', [$game->code => 'host-token']);
    }

    public function test_a_resume_link_with_a_bad_token_leaves_you_watching(): void
    {
        // Nothing useful to say to someone who mistyped a secret, so this is not
        // an error page — it is simply not a seat.
        $game = Game::factory()->hostToken('host-token')->create();

        $this->get("/games/{$game->code}/resume/wrong-token")
            ->assertRedirect("/games/{$game->code}");

        $this->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page->where('seat', null));
    }

    public function test_the_resume_link_is_only_sent_to_the_seat_that_owns_it(): void
    {
        $game = Game::factory()->hostToken('host-token')->create();

        $this->withSession(['seat_tokens' => [$game->code => 'host-token']])
            ->get("/games/{$game->code}")
            ->assertInertia(fn ($page) => $page->where(
                'resumeUrl',
                route('games.resume', ['game' => $game->code, 'token' => 'host-token'])
            ));
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
