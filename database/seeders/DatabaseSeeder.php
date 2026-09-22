<?php

namespace Database\Seeders;

use Database\Factories\GameFactory;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     *
     * Nothing to seed: there are no accounts, and a game is only ever made by
     * someone opening one with a deck they own. Games for local poking about
     * come from {@see GameFactory}.
     */
    public function run(): void
    {
        //
    }
}
