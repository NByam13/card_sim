---
paths:
  - 'app/**'
---

# App

## All enums live in app/Enums
Every PHP enum goes in `app/Enums` (`App\Enums\...`), never beside the domain code it serves (e.g. not `App\Games\Seat`), so enums stay in one place. Code that uses them imports them explicitly. Prefer an enum over magic strings or numbers in application code; tests may still assert against literals.
