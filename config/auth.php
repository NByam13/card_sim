<?php

/*
|--------------------------------------------------------------------------
| Authentication
|--------------------------------------------------------------------------
|
| This app has no accounts. What a request carries instead is a
| `App\Games\Participant`: an opaque session-held identity that may hold seats
| in games. It is resolved by the `seat` guard, registered with
| `Auth::viaRequest()` in AppServiceProvider, and it authenticates nobody — there
| are no credentials, no provider and no password broker, so all three are gone
| from this file.
|
| The guard exists because the broadcaster needs an Authenticatable before a
| presence-channel callback runs. See documentation/anonymous-games/spec.md.
|
*/

return [

    'defaults' => [
        'guard' => 'seat',
    ],

    'guards' => [
        'seat' => [
            'driver' => 'seat',
        ],
    ],

];
