<?php

use App\Http\Controllers\BoardSyncController;
use App\Http\Controllers\CardController;
use App\Http\Controllers\GameController;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\TurnOrderController;
use Illuminate\Support\Facades\Route;

Route::get('/', [HomeController::class, 'index'])->name('home');

// Anonymous, so the only brake on someone opening games in a loop is the
// throttle. Each one costs a PonyRec deck fetch, which is the real reason.
Route::post('/games', [GameController::class, 'store'])
    ->middleware('throttle:10,1')
    ->name('games.store');

Route::get('/games/{game}', [GameController::class, 'show'])->name('games.show');

Route::post('/games/{game}/join', [GameController::class, 'join'])
    ->middleware('throttle:10,1')
    ->name('games.join');

Route::post('/games/{game}/accept', [GameController::class, 'accept'])->name('games.accept');

Route::delete('/games/{game}', [GameController::class, 'destroy'])->name('games.destroy');

// A seat's board, leaving the browser. Both derive the seat from the session.
Route::post('/games/{game}/sync', [BoardSyncController::class, 'relay'])->name('games.sync');
Route::post('/games/{game}/state', [BoardSyncController::class, 'save'])->name('games.state');

Route::post('/games/{game}/turn-order/roll', [TurnOrderController::class, 'roll'])->name('games.turn-order.roll');
Route::post('/games/{game}/turn-order/elect', [TurnOrderController::class, 'elect'])->name('games.turn-order.elect');

// Cards a mirror meets that its own deck does not carry. `where` so a number
// containing a dot still routes. Throttled because the number space is open and
// a miss is never cached, so each one costs a round trip to PonyRec.
Route::get('/cards/{number}', [CardController::class, 'show'])
    ->where('number', '.*')
    ->middleware('throttle:120,1')
    ->name('cards.show');
