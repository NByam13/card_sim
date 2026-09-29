<?php

namespace App\Games\PonyRec;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * One card from PonyRec, by its number.
 *
 * Called when a mirror meets a card its own deck does not contain — the
 * opponent revealed something. Deliberately the public catalogue rather than the
 * opponent's stored deck: serving from that snapshot would hand out their
 * decklist to anyone who enumerated card numbers, while the catalogue is
 * readable on PonyRec anyway.
 *
 * Cached hard. Card data changes only when a card is corrected, so a table
 * fetches each card once rather than once per game.
 *
 * Contract: PonyRec's documentation/deck-lookup-api/api.md.
 */
final class CardClient
{
    /**
     * The card, or null when PonyRec does not have it or cannot be reached.
     *
     * Null rather than an exception: a card that will not resolve is a card that
     * renders by name instead of by art, which is a worse board but not a broken
     * one, and never a reason to fail the request that asked.
     *
     * @return array<string, mixed>|null
     */
    public function fetch(string $number): ?array
    {
        $config = config('services.ponyrec');

        // A null is never cached — `remember` treats it as a miss — so a card
        // that failed to resolve is retried rather than remembered as absent.
        return Cache::remember(
            self::cacheKey($number),
            now()->addSeconds((int) $config['card_ttl']),
            function () use ($number, $config): ?array {
                try {
                    $response = Http::baseUrl($config['base_url'])
                        ->timeout($config['timeout'])
                        ->withOptions(['verify' => $config['verify']])
                        ->acceptJson()
                        ->get('/api/cards/'.rawurlencode($number));
                } catch (ConnectionException $e) {
                    Log::warning('card.unreachable', ['card' => $number, 'error' => $e->getMessage()]);

                    return null;
                }

                if ($response->failed()) {
                    Log::info('card.not_resolved', ['card' => $number, 'status' => $response->status()]);

                    return null;
                }

                $card = $response->json();

                return is_array($card) && isset($card['card_number']) ? $card : null;
            }
        );
    }

    public static function cacheKey(string $number): string
    {
        return 'ponyrec.card.'.sha1($number);
    }
}
