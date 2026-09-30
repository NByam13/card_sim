<?php

namespace Tests\Unit;

use App\Enums\Seat;
use PHPUnit\Framework\TestCase;

class SeatTest extends TestCase
{
    public function test_each_seat_opposes_the_other(): void
    {
        $this->assertSame(Seat::Guest, Seat::Host->opposing());
        $this->assertSame(Seat::Host, Seat::Guest->opposing());
    }

    public function test_a_seat_names_its_half_of_a_column_pair(): void
    {
        $this->assertSame('host_state', Seat::Host->column('state'));
        $this->assertSame('guest_accepted_at', Seat::Guest->column('accepted_at'));
    }
}
