<?php

namespace Tests\Feature\Games;

use App\Models\Game;
use Database\Factories\GameFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Opening a game: a deck code becomes a game with its host seat claimed.
 */
class OpenGameTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.ponyrec.base_url' => 'https://ponyrec.test']);
    }

    /** @param array<string, mixed>|null $deck */
    private function fakeDeck(?array $deck = null): void
    {
        Http::fake([
            'ponyrec.test/api/decks/*' => Http::response($deck ?? GameFactory::deck('Rainbow Aggro')),
        ]);
    }

    public function test_it_opens_a_game_and_seats_the_host(): void
    {
        $this->fakeDeck();

        $response = $this->post('/games', ['deck_code' => 'abcdef123456', 'name' => 'Nick']);

        $game = Game::sole();
        $response->assertRedirect("/games/{$game->code}");

        $this->assertSame('waiting', $game->status);
        $this->assertSame('mlp', $game->setup);
        $this->assertSame('Nick', $game->host_name);
        $this->assertSame('abcdef123456', $game->host_deck_code);
        $this->assertNull($game->guest_token_hash);
    }

    public function test_the_deck_is_snapshotted_rather_than_referenced(): void
    {
        // The snapshot is what makes a game survive the deck being edited,
        // renamed or hidden on PonyRec mid-match.
        $this->fakeDeck(GameFactory::deck('As imported'));

        $this->post('/games', ['deck_code' => 'abcdef123456']);

        $this->assertSame('As imported', Game::sole()->deckNameFor('host'));
    }

    public function test_the_host_holds_a_seat_afterwards(): void
    {
        $this->fakeDeck();

        $this->post('/games', ['deck_code' => 'abcdef123456']);
        $game = Game::sole();

        // Two things a real browser gets for free have to be arranged here: test
        // requests carry no cookies between calls, so the session is handed over
        // explicitly, and the guard memoizes the participant it resolved during
        // the POST (before the seat existed) in a container these calls share.
        $this->app['auth']->forgetGuards();

        $this->withSession(['seat_tokens' => [$game->code => session('seat_tokens')[$game->code]]])
            ->get("/games/{$game->code}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('games/show')
                ->where('seat', 'host')
                ->where('canJoin', false)
                ->whereNot('resumeUrl', null));
    }

    public function test_only_the_hash_of_the_seat_token_is_stored(): void
    {
        $this->fakeDeck();

        $this->post('/games', ['deck_code' => 'abcdef123456']);

        $token = session('seat_tokens')[Game::sole()->code];

        $this->assertSame(64, strlen(Game::sole()->host_token_hash));
        $this->assertNotSame($token, Game::sole()->host_token_hash);
        $this->assertSame('host', Game::sole()->seatFor($token));
    }

    // ── Deck import failures ────────────────────────────────────────────────

    public function test_a_private_deck_is_refused_with_something_to_do_about_it(): void
    {
        Http::fake(['ponyrec.test/api/decks/*' => Http::response(
            ['message' => 'nope', 'code' => 'deck.private'], 404
        )]);

        $this->post('/games', ['deck_code' => 'abcdef123456'])
            ->assertSessionHasErrors(['deck_code' => 'That deck is private. Set it to Unlisted on PonyRec, then try again.']);

        $this->assertSame(0, Game::count());
    }

    public function test_an_unknown_deck_code_is_refused(): void
    {
        Http::fake(['ponyrec.test/api/decks/*' => Http::response(
            ['message' => 'nope', 'code' => 'deck.not_found'], 404
        )]);

        $this->post('/games', ['deck_code' => 'abcdef123456'])
            ->assertSessionHasErrors(['deck_code' => 'No deck has that code. Check it was copied in full.']);

        $this->assertSame(0, Game::count());
    }

    public function test_ponyrec_being_down_is_not_the_players_problem(): void
    {
        Http::fake(['ponyrec.test/api/decks/*' => Http::response('', 500)]);

        $this->post('/games', ['deck_code' => 'abcdef123456'])
            ->assertSessionHasErrors(['deck_code' => "PonyRec didn't answer. Try again in a moment."]);

        $this->assertSame(0, Game::count());
    }

    public function test_a_deck_code_is_validated_before_ponyrec_is_called(): void
    {
        Http::fake();

        $this->post('/games', ['deck_code' => 'not a code'])->assertSessionHasErrors('deck_code');

        Http::assertNothingSent();
        $this->assertSame(0, Game::count());
    }

    public function test_it_asks_ponyrec_for_the_deck_by_code(): void
    {
        $this->fakeDeck();

        $this->post('/games', ['deck_code' => 'abcdef123456']);

        Http::assertSent(fn (Request $request) => $request->url() === 'https://ponyrec.test/api/decks/abcdef123456'
            && $request->method() === 'GET');
    }

    public function test_a_name_is_optional(): void
    {
        $this->fakeDeck();

        $this->post('/games', ['deck_code' => 'abcdef123456']);

        $game = Game::sole();
        $this->assertNull($game->host_name);
        $this->assertSame('Host', $game->nameFor('host'));
    }
}
