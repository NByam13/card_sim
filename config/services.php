<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
     * PonyRec, the deck source. A deck code is imported once per seat through
     * `GET /api/decks/{code}` and snapshotted onto the game row, so nothing here
     * is on a hot path. No token: that endpoint is public.
     *
     * `verify` exists for local development only — Herd serves ponyrec.test with
     * a certificate curl's CA bundle does not carry. Never false in production.
     */
    'ponyrec' => [
        'base_url' => env('PONYREC_BASE_URL', 'https://ponyrec.net'),
        'timeout' => (int) env('PONYREC_TIMEOUT', 5),
        'verify' => filter_var(env('PONYREC_VERIFY_TLS', true), FILTER_VALIDATE_BOOL),
    ],

];
