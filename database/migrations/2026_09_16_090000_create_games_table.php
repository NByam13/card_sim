<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A game: two seats, the decks they brought, and the setup that decides what the
 * table looks like.
 *
 * Seats are anonymous. A seat is a random token whose hash lives here and whose
 * plaintext lives in one browser's session, so this table names nobody — there
 * is no user to reference and deliberately no account to link to.
 *
 * Each deck is stored twice over: the PonyRec code it came from, and a snapshot
 * of what that code returned at claim time. The snapshot is what the game is
 * played with, so editing, renaming or hiding the deck on PonyRec mid-match
 * cannot change or break a game in progress.
 *
 * Turn order, the turn cursor, board state and scoring are deliberately absent:
 * they arrive with the slices that use them.
 *
 * @see documentation/anonymous-games/spec.md
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('games', function (Blueprint $table) {
            $table->id();
            $table->string('code', 12)->unique();
            // Which game this table is playing. The only thing here that knows a
            // game exists; everything else is generic.
            $table->string('setup', 32)->default('mlp');
            $table->string('status', 8)->default('waiting');

            // SHA-256 of the seat token. Fixed 64 chars, and never the token
            // itself: a leaked row must not hand out live seats.
            $table->char('host_token_hash', 64);
            $table->char('guest_token_hash', 64)->nullable();

            $table->string('host_name', 40)->nullable();
            $table->string('guest_name', 40)->nullable();

            $table->string('host_deck_code', 32)->nullable();
            $table->string('guest_deck_code', 32)->nullable();
            $table->json('host_deck')->nullable();
            $table->json('guest_deck')->nullable();

            $table->timestamp('last_activity_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('games');
    }
};
