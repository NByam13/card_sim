<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who went first, and the shared turn cursor.
 *
 * `turn_stop` is opaque to the server (e.g. `contact:2`); the clients' shared
 * setup decides what a legal stop is.
 *
 * @see documentation/pvp-decoupling/spec.md
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->string('first_player')->nullable();
            $table->json('turn_order_roll')->nullable();
            $table->integer('turn_number')->default(0);
            $table->string('active_seat')->nullable();
            $table->string('turn_stop')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('games', function (Blueprint $table) {
            $table->dropColumn(['first_player', 'turn_order_roll', 'turn_number', 'active_seat', 'turn_stop']);
        });
    }
};
