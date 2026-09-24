<?php

namespace App\Http\Controllers;

use App\Games\PonyRec\CardClient;
use Illuminate\Http\JsonResponse;

/**
 * One card by number, proxied from PonyRec and cached here.
 *
 * A mirror asks for the cards its own deck does not contain. Proxied rather than
 * fetched from the browser so PonyRec sees one server instead of every player,
 * and so the cache is shared across every game rather than living per-browser.
 *
 * Not under `/games`: this is catalogue data, and a card is the same card in
 * every game.
 *
 * @see documentation/board-sync/spec.md
 */
class CardController extends Controller
{
    public function __construct(private readonly CardClient $cards) {}

    public function show(string $number): JsonResponse
    {
        $card = $this->cards->fetch($number);

        if ($card === null) {
            return response()->json(['message' => 'No card has this number.'], 404);
        }

        // The browser caches too, so a card already on screen costs nothing.
        return response()->json($card)->header('Cache-Control', 'private, max-age=86400');
    }
}
