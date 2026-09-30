<?php

namespace App\Http\Requests;

/**
 * A seat's board, whole and redacted, saved so a refresh resumes it.
 */
class SaveBoardRequest extends ActiveSeatRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'seq' => ['required', 'integer', 'min:0'],
            'state' => ['required', 'array'],
            'public_state' => ['required', 'array'],
        ];
    }
}
