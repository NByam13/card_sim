<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The match format, and the score within it.
 *
 * A row is a match of one or three games. `status` stays at the match level:
 * `finished` is the match being over, never a game within it. `game_number`
 * walks the games, and `game_results` holds one `{game, winner, reason}` per
 * game played, which is where each seat's wins are counted from.
 *
 * @see documentation/pvp-decoupling/spec.md
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->string('format', 4)->default('bo1');
            $table->unsignedTinyInteger('game_number')->default(1);
            $table->json('game_results')->default('[]');
            $table->string('winner_seat')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->dropColumn(['format', 'game_number', 'game_results', 'winner_seat']);
        });
    }
};
