<?php

namespace Tests\Unit;

use App\Enums\MatchFormat;
use App\Enums\Seat;
use App\Enums\WinReason;
use App\Models\Game;
use Database\Factories\GameFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The match format, and the score within a match.
 */
class GameMatchFormatTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_new_game_is_game_one_of_a_bo1_with_no_score(): void
    {
        $game = Game::factory()->create()->refresh();

        $this->assertSame(MatchFormat::Bo1, $game->format);
        $this->assertSame(1, $game->game_number);
        $this->assertSame([], $game->game_results);
        $this->assertNull($game->winner_seat);
    }

    public function test_the_match_columns_round_trip_mid_bo3(): void
    {
        $game = $this->seated()->bo3()->gamesWonBy(Seat::Guest)->create()->refresh();

        $this->assertSame(MatchFormat::Bo3, $game->format);
        $this->assertSame(2, $game->game_number);
        $this->assertSame([['game' => 1, 'winner' => 'guest', 'reason' => 'story']], $game->game_results);
        $this->assertSame('active', $game->status->value);
        $this->assertNull($game->winner_seat);
    }

    public function test_games_to_win(): void
    {
        $this->assertSame(1, Game::factory()->make()->gamesToWin());
        $this->assertSame(2, Game::factory()->bo3()->make()->gamesToWin());
    }

    public function test_a_bo1_at_0_0(): void
    {
        $game = $this->seated()->make();

        $this->assertScore($game, host: 0, guest: 0);
        $this->assertSame('active', $game->status->value);
    }

    public function test_a_bo1_at_1_0_is_over(): void
    {
        $game = $this->seated()->gamesWonBy(Seat::Host)->make();

        $this->assertScore($game, host: 1, guest: 0);
        $this->assertSame('finished', $game->status->value);
        $this->assertSame(Seat::Host, $game->winner_seat);
    }

    public function test_a_bo3_at_0_0(): void
    {
        $game = $this->seated()->bo3()->make();

        $this->assertScore($game, host: 0, guest: 0);
        $this->assertSame(1, $game->game_number);
    }

    public function test_a_bo3_at_1_0_is_on_game_two(): void
    {
        $game = $this->seated()->bo3()->gamesWonBy(Seat::Host)->make();

        $this->assertScore($game, host: 1, guest: 0);
        $this->assertSame(2, $game->game_number);
        $this->assertSame('active', $game->status->value);
    }

    public function test_a_bo3_at_2_1_is_over(): void
    {
        $game = $this->seated()->bo3()->gamesWonBy(Seat::Host, Seat::Guest, Seat::Host)->make();

        $this->assertScore($game, host: 2, guest: 1);
        $this->assertSame(3, $game->game_number);
        $this->assertSame('finished', $game->status->value);
        $this->assertSame(Seat::Host, $game->winner_seat);
    }

    public function test_the_format_is_open_until_the_guest_seat_is_taken(): void
    {
        $this->assertFalse(Game::factory()->make()->formatLocked());
        $this->assertTrue($this->seated()->make()->formatLocked());
        $this->assertTrue($this->seated()->matchLive()->make()->formatLocked());
    }

    public function test_the_format_is_locked_from_game_two_and_once_finished(): void
    {
        $this->assertTrue($this->seated()->bo3()->gamesWonBy(Seat::Guest)->make()->formatLocked());
        $this->assertTrue($this->seated()->gamesWonBy(Seat::Guest)->make()->formatLocked());
    }

    public function test_winning_a_bo1_at_0_0_finishes_the_match(): void
    {
        $game = $this->seated()->create();

        $this->assertTrue($game->recordGameResult(Seat::Guest, WinReason::Concede));

        $game->refresh();
        $this->assertScore($game, host: 0, guest: 1);
        $this->assertSame([['game' => 1, 'winner' => 'guest', 'reason' => 'concede']], $game->game_results);
        $this->assertSame('finished', $game->status->value);
        $this->assertSame(Seat::Guest, $game->winner_seat);
    }

    public function test_winning_game_one_of_a_bo3_leaves_the_match_live(): void
    {
        $game = $this->seated()->bo3()->create();

        $this->assertTrue($game->recordGameResult(Seat::Host, WinReason::Story));

        $game->refresh();
        $this->assertScore($game, host: 1, guest: 0);
        $this->assertSame('active', $game->status->value);
        $this->assertNull($game->winner_seat);
    }

    public function test_winning_a_second_game_of_a_bo3_at_1_0_finishes_the_match(): void
    {
        $game = $this->seated()->bo3()->gamesWonBy(Seat::Host)->create();

        $this->assertTrue($game->recordGameResult(Seat::Host, WinReason::Story));

        $game->refresh();
        $this->assertScore($game, host: 2, guest: 0);
        $this->assertSame('finished', $game->status->value);
        $this->assertSame(Seat::Host, $game->winner_seat);
    }

    public function test_winning_the_decider_of_a_bo3_finishes_it_2_1(): void
    {
        $game = $this->seated()->bo3()->gamesWonBy(Seat::Host, Seat::Guest)->create();

        $this->assertTrue($game->recordGameResult(Seat::Guest, WinReason::Concede));

        $game->refresh();
        $this->assertScore($game, host: 1, guest: 2);
        $this->assertSame(3, $game->game_number);
        $this->assertSame(Seat::Guest, $game->winner_seat);
    }

    public function test_a_game_already_recorded_is_not_recorded_again(): void
    {
        $game = $this->seated()->bo3()->create();
        $game->recordGameResult(Seat::Host, WinReason::Story);

        $this->assertFalse($game->recordGameResult(Seat::Guest, WinReason::Concede));
        $this->assertScore($game->refresh(), host: 1, guest: 0);
    }

    public function test_only_one_of_two_results_racing_for_a_game_is_kept(): void
    {
        $game = $this->seated()->bo3()->create();
        $stale = Game::find($game->id);

        $this->assertTrue($game->recordGameResult(Seat::Host, WinReason::Story));
        $this->assertFalse($stale->recordGameResult(Seat::Guest, WinReason::Concede));

        $this->assertSame([], $stale->game_results);
        $this->assertScore($game->refresh(), host: 1, guest: 0);
    }

    public function test_a_finished_match_records_nothing(): void
    {
        $game = $this->seated()->gamesWonBy(Seat::Host)->create();

        $this->assertFalse($game->recordGameResult(Seat::Guest, WinReason::Story));
        $this->assertSame(Seat::Host, $game->refresh()->winner_seat);
    }

    public function test_a_game_with_an_open_seat_records_nothing(): void
    {
        $this->assertFalse(Game::factory()->create()->recordGameResult(Seat::Host, WinReason::Story));
    }

    private function seated(): GameFactory
    {
        return Game::factory()->guestToken('guest-token');
    }

    private function assertScore(Game $game, int $host, int $guest): void
    {
        $this->assertSame($host, $game->winsFor(Seat::Host));
        $this->assertSame($guest, $game->winsFor(Seat::Guest));
    }
}
