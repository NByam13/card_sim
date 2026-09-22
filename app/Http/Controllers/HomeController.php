<?php

namespace App\Http\Controllers;

use Inertia\Response;

class HomeController
{
    public function index(): Response
    {
        return inertia('home');
    }
}
