<?php

use App\Enums\GameStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Which match the row is on. A rematch starts the row over from game 1, so
 * `game_number` alone no longer says which game a request was made in.
 *
 * @see documentation/board-sync/spec.md
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->unsignedInteger('match_number')->default(1);
        });

        // Rows finished before a finish cleared the acceptances.
        DB::table('games')
            ->where('status', GameStatus::Finished->value)
            ->update(['host_accepted_at' => null, 'guest_accepted_at' => null]);
    }

    public function down(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->dropColumn('match_number');
        });
    }
};
