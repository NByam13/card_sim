<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sessions. This replaces the starter kit's users/password-reset/sessions
 * migration: the app has no accounts, so there is no users table for a session
 * to belong to.
 *
 * The session is load-bearing here in a way it is not in an app with accounts —
 * it holds the seat secrets that make a visitor a player.
 *
 * @see documentation/anonymous-games/spec.md
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            // Laravel's database session handler stamps the authenticated
            // identifier on every write, and this app always has one: the
            // participant id (`v:{uuid}`) the seat guard resolves. So the column
            // stays, but as a **string** rather than the kit's foreign key —
            // there is no users table, and the id is not an integer.
            $table->string('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
    }
};
