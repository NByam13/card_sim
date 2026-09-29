<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When each seat accepted the match. Both set means it is live.
 *
 * A seat can already be playing alone when the other one is taken, and a match
 * cannot begin underneath a board someone is mid-game on. Stored rather than
 * held on the page because both halves have to survive a refresh: the seat that
 * declined would otherwise be asked again, and the seat waiting on them would
 * lose the only thing saying why the table is empty.
 *
 * @see documentation/board-sync/spec.md
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->timestamp('host_accepted_at')->nullable();
            $table->timestamp('guest_accepted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->dropColumn(['host_accepted_at', 'guest_accepted_at']);
        });
    }
};
