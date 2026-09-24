<?php

namespace Tests\Feature\Games;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The card a mirror meets that its own deck does not carry.
 *
 * @see documentation/board-sync/spec.md
 */
class CardLookupTest extends TestCase
{
    use RefreshDatabase;

    /** The cache outlives a test, and every test here fetches the same number. */
    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
    }

    /** @return array<string, mixed> */
    private function card(string $number = 'TEST-C01'): array
    {
        return [
            'card_number' => $number,
            'name' => 'Applejack',
            'subtype' => 'character',
            'card_text' => '[Appear] Draw a card.',
            'image_url' => 'https://example.test/TEST-C01.webp',
        ];
    }

    public function test_it_serves_a_card_from_ponyrec(): void
    {
        Http::fake(['*/api/cards/*' => Http::response($this->card())]);

        $this->getJson('/cards/TEST-C01')
            ->assertOk()
            ->assertJsonPath('name', 'Applejack')
            ->assertJsonPath('card_text', '[Appear] Draw a card.');
    }

    public function test_it_asks_ponyrec_once_and_serves_the_rest_from_cache(): void
    {
        Http::fake(['*/api/cards/*' => Http::response($this->card())]);

        $this->getJson('/cards/TEST-C01')->assertOk();
        $this->getJson('/cards/TEST-C01')->assertOk();
        $this->getJson('/cards/TEST-C01')->assertOk();

        Http::assertSentCount(1);
    }

    /** A shining printing leads with ※, which has to survive both hops. */
    public function test_it_passes_a_non_ascii_card_number_through(): void
    {
        Http::fake(['*' => Http::response($this->card('※TEST-CR01'))]);

        $this->getJson('/cards/'.rawurlencode('※TEST-CR01'))
            ->assertOk()
            ->assertJsonPath('card_number', '※TEST-CR01');

        Http::assertSent(fn ($request) => str_contains($request->url(), rawurlencode('※TEST-CR01')));
    }

    public function test_an_unknown_card_is_a_404(): void
    {
        Http::fake(['*' => Http::response(['code' => 'card.not_found'], 404)]);

        $this->getJson('/cards/TEST-NOPE')->assertNotFound();
    }

    /**
     * A card that will not resolve renders by name instead of by art, which is a
     * worse board but not a broken one, so PonyRec being down is a 404 here
     * rather than a 500 that fails the page.
     */
    public function test_ponyrec_being_unreachable_is_a_404_not_a_500(): void
    {
        Http::fake(fn () => throw new ConnectionException('down'));

        $this->getJson('/cards/TEST-C01')->assertNotFound();
    }

    /** Nulls are not cached, so a card that failed once is asked for again. */
    public function test_a_failed_lookup_is_retried_rather_than_remembered(): void
    {
        Http::fakeSequence()
            ->push(['code' => 'card.not_found'], 404)
            ->push($this->card(), 200);

        $this->getJson('/cards/TEST-C01')->assertNotFound();
        $this->getJson('/cards/TEST-C01')->assertOk();

        Http::assertSentCount(2);
    }

    public function test_it_tells_the_browser_to_cache_too(): void
    {
        Http::fake(['*' => Http::response($this->card())]);

        $this->getJson('/cards/TEST-C01')
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=86400, private');
    }

    /** No seat, no game: a card is the same card to everyone. */
    public function test_it_needs_no_seat(): void
    {
        Http::fake(['*' => Http::response($this->card())]);

        $this->getJson('/cards/TEST-C01')->assertOk();
    }

    public function test_a_malformed_response_from_ponyrec_is_not_served(): void
    {
        Http::fake(['*' => Http::response(['unexpected' => true])]);

        $this->getJson('/cards/TEST-C01')->assertNotFound();
    }
}
