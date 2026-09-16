<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Taking a seat, whether by opening a game or joining one: the claimant brings a
 * PonyRec deck code and, optionally, a name to be called.
 *
 * Seat availability is the controller's business; this only shapes the input.
 * The deck code is checked by trying to import it, because PonyRec is the only
 * thing that can say whether a code means anything.
 */
class ClaimSeatRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // A PonyRec deck slug: 12 lower-case alphanumerics. Shaped here so an
            // obviously wrong code never becomes an HTTP call.
            'deck_code' => ['required', 'string', 'regex:/^[a-z0-9]{12}$/'],
            // No account, so this is whatever the player types, and it is shown
            // to one other person. Bounded, optional, and never required.
            'name' => ['nullable', 'string', 'max:40'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'deck_code.regex' => 'A deck code is 12 letters and numbers. Copy it from the deck on PonyRec.',
        ];
    }

    /** The deck code, normalised the way PonyRec stores it. */
    public function deckCode(): string
    {
        return strtolower(trim($this->validated('deck_code')));
    }

    public function displayName(): ?string
    {
        $name = trim((string) $this->validated('name'));

        return $name === '' ? null : $name;
    }
}
