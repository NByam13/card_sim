<?php

use App\Broadcasting\GameChannel;
use Illuminate\Support\Facades\Broadcast;

/**
 * A game's channel. The decision of who may be here, and as what, lives in
 * {@see GameChannel} — it is this slice's authorization boundary, and a closure
 * in a route file is a poor place to test one from.
 */
Broadcast::channel('game.{game}', GameChannel::class, ['guards' => ['seat']]);
