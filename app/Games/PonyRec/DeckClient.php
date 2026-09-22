<?php

namespace App\Games\PonyRec;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Fetches a deck from PonyRec by its code.
 *
 * Called once per seat, at claim time, and never again: what comes back is
 * snapshotted onto the game row and the game is played from that. So this is
 * allowed to be slow and is not allowed to be surprising — every failure becomes
 * a {@see DeckImportFailed} carrying something the player can act on.
 *
 * The response is stored exactly as returned. Nothing here interprets a card,
 * and nothing constructs a card or image URL: PonyRec owns all of that.
 *
 * Contract: PonyRec's documentation/deck-lookup-api/api.md.
 */
final class DeckClient
{
    /**
     * @return array<string, mixed> the deck, as the endpoint returned it
     *
     * @throws DeckImportFailed
     */
    public function fetch(string $code): array
    {
        $config = config('services.ponyrec');

        try {
            $response = Http::baseUrl($config['base_url'])
                ->timeout($config['timeout'])
                ->withOptions(['verify' => $config['verify']])
                ->acceptJson()
                ->get("/api/decks/{$code}");
        } catch (ConnectionException $e) {
            Log::warning('deck.import_unreachable', ['deck' => $code, 'error' => $e->getMessage()]);

            throw DeckImportFailed::unavailable();
        }

        if ($response->failed()) {
            // The endpoint names both of its 404s, so a player gets told which
            // problem they have. Anything else is ours, not theirs.
            throw match ($response->json('code')) {
                'deck.private' => DeckImportFailed::private(),
                'deck.not_found' => DeckImportFailed::notFound(),
                default => $this->unexpected($code, $response->status()),
            };
        }

        $deck = $response->json();

        if (! is_array($deck) || ! isset($deck['code'], $deck['cards'])) {
            Log::error('deck.import_unreadable', ['deck' => $code]);

            throw DeckImportFailed::unavailable();
        }

        Log::info('deck.imported', ['deck' => $code, 'entries' => count($deck['cards'])]);

        return $deck;
    }

    private function unexpected(string $code, int $status): DeckImportFailed
    {
        Log::warning('deck.import_failed', ['deck' => $code, 'status' => $status]);

        return DeckImportFailed::unavailable();
    }
}
