<?php

use App\Http\Controllers\GameController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'home')->name('home');

// Anonymous, so the only brake on someone opening games in a loop is the
// throttle. Each one costs a PonyRec deck fetch, which is the real reason.
Route::post('/games', [GameController::class, 'store'])
    ->middleware('throttle:10,1')
    ->name('games.store');

Route::get('/games/{game}', [GameController::class, 'show'])->name('games.show');

Route::post('/games/{game}/join', [GameController::class, 'join'])
    ->middleware('throttle:10,1')
    ->name('games.join');

// The token in the path *is* the seat's secret, so this link needs no signing.
Route::get('/games/{game}/resume/{token}', [GameController::class, 'resume'])
    ->middleware('throttle:10,1')
    ->name('games.resume');

Route::delete('/games/{game}', [GameController::class, 'destroy'])->name('games.destroy');
