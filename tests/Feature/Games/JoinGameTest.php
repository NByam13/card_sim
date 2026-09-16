<?php

namespace Tests\Feature\Games;

use App\Models\Game;
use Database\Factories\GameFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Joining a game: the second seat, claimed by anyone holding the link.
 */
class JoinGameTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.ponyrec.base_url' => 'https://ponyrec.test']);
    }

    /**
     * Faked per test rather than in setUp: the first stub registered for a URL
     * wins, so a shared success stub would quietly swallow the failure stubs
     * below and those tests would assert nothing.
     */
    private function fakeDeck(): void
    {
        Http::fake(['ponyrec.test/api/decks/*' => Http::response(GameFactory::deck('Guest deck'))]);
    }

    public function test_a_visitor_with_the_link_takes_the_free_seat(): void
    {
        $this->fakeDeck();
        $game = Game::factory()->create();

        $this->post("/games/{$game->code}/join", ['deck_code' => 'abcdef123456', 'name' => 'Sam'])
            ->assertRedirect("/games/{$game->code}");

        $game->refresh();
        $this->assertSame('active', $game->status);
        $this->assertSame('Sam', $game->guest_name);
        $this->assertSame('Guest deck', $game->deckNameFor('guest'));
    }

    public function test_the_joiner_holds_the_guest_seat_afterwards(): void
    {
        $this->fakeDeck();
        $game = Game::factory()->create();

        $this->post("/games/{$game->code}/join", ['deck_code' => 'abcdef123456']);

        // Two things a real browser gets for free have to be arranged here: test
        // requests carry no cookies between calls, so the session is handed over
        // explicitly, and the guard memoizes the participant it resolved during
        // the POST (before the seat existed) in a container these calls share.
        $this->app['auth']->forgetGuards();

        $this->withSession(['seat_tokens' => [$game->code => session('seat_tokens')[$game->code]]])
            ->get("/games/{$game->code}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('seat', 'guest'));
    }

    public function test_a_full_game_cannot_be_joined(): void
    {
        $game = Game::factory()->guestToken('taken-token')->create();

        $this->post("/games/{$game->code}/join", ['deck_code' => 'abcdef123456'])
            ->assertSessionHasErrors('deck_code');

        // Refused before PonyRec is asked for anything.
        Http::assertNothingSent();
    }

    public function test_a_seat_holder_cannot_take_the_other_seat_too(): void
    {
        $game = Game::factory()->hostToken('host-token')->create();

        $this->withSession(['seat_tokens' => [$game->code => 'host-token']])
            ->post("/games/{$game->code}/join", ['deck_code' => 'abcdef123456'])
            ->assertSessionHasErrors('deck_code');

        $this->assertNull($game->refresh()->guest_token_hash);
        Http::assertNothingSent();
    }

    public function test_a_failed_deck_import_leaves_the_seat_open(): void
    {
        Http::fake(['ponyrec.test/api/decks/*' => Http::response(['code' => 'deck.private'], 404)]);
        $game = Game::factory()->create();

        $this->post("/games/{$game->code}/join", ['deck_code' => 'abcdef123456'])
            ->assertSessionHasErrors(['deck_code' => 'That deck is private. Set it to Unlisted on PonyRec, then try again.']);

        $game->refresh();
        $this->assertNull($game->guest_token_hash);
        $this->assertSame('waiting', $game->status);
    }

    public function test_the_second_of_two_simultaneous_joins_is_refused(): void
    {
        // Both callers pass the "seat is open" check; the conditional update is
        // what settles it, so only one of them can win.
        $this->fakeDeck();
        $game = Game::factory()->create();

        $first = $this->post("/games/{$game->code}/join", ['deck_code' => 'abcdef123456']);

        // A different browser, not the same one asking twice — otherwise this
        // would be refused for already holding a seat, which proves nothing
        // about the race.
        $this->flushSession();

        $second = $this->post("/games/{$game->code}/join", ['deck_code' => 'abcdef123456']);

        $first->assertRedirect("/games/{$game->code}");
        $second->assertSessionHasErrors('deck_code');
        $this->assertSame(1, Game::whereNotNull('guest_token_hash')->count());
    }
}
