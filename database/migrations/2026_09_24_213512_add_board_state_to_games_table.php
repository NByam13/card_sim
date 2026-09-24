<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Each seat's board, saved so a refresh resumes a match instead of re-dealing it.
 *
 * Two copies per seat, because they answer different questions: `*_state` is the
 * whole board, which restores your own half, and `*_public_state` is the same
 * board redacted, which is what seeds the opponent's mirror when they reload —
 * without it they would face an empty table until you next moved a card.
 *
 * Both store cards as numbers, resolved against the deck snapshot already on the
 * row. The server reads neither: it holds no rules and does not know what a
 * board means.
 *
 * @see documentation/board-sync/spec.md
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->json('host_state')->nullable();
            $table->json('guest_state')->nullable();
            $table->json('host_public_state')->nullable();
            $table->json('guest_public_state')->nullable();
            // The last saved frame's sequence, so a restored board keeps counting
            // rather than restarting into frames a mirror would discard.
            $table->unsignedInteger('host_seq')->default(0);
            $table->unsignedInteger('guest_seq')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->dropColumn([
                'host_state',
                'guest_state',
                'host_public_state',
                'guest_public_state',
                'host_seq',
                'guest_seq',
            ]);
        });
    }
};
