# Anonymous Games: Test Plan

Manual checklist for the lobby and seat slice. Automated coverage lives in
`tests/Feature/Games/`; this is the part a person has to look at.

Setup: `composer dev` (serves the app, queue, logs, Vite and Reverb together), PonyRec running at
`https://ponyrec.test`, and two **different browsers** (or one normal and one private window) so
the two seats hold separate sessions. Have ready: an Unlisted PonyRec deck code, a Private one,
and a made-up one.

## Creating and joining

- [ ] Create a game with the Unlisted deck code. You land on the game page as the host, with an
      invite link and your deck's name shown.
- [ ] Open the invite link in the second browser. It offers the free seat; joining with the same
      deck code puts both of you in the game and flips it to active.
- [ ] Both browsers show the other player present, seated and named **without a refresh** — the
      host's empty seat fills on its own, and neither player reads as "away".
- [ ] The invite link's copy button puts the link on the clipboard, and the link still shows once
      both seats are taken.
- [ ] The second browser cannot join twice, and a third browser opening the link is offered
      watching rather than a seat.

## Deck import failures

- [ ] Joining with the **private** deck code is refused, and the message tells you to set it to
      Unlisted. The seat is still free afterwards.
- [ ] Joining with a **made-up** code is refused with "no deck has that code".
- [ ] Stop PonyRec (or point `PONYREC_BASE_URL` at a dead host) and try to create a game: you get
      the "PonyRec didn't answer" message, not a stack trace, and no game is created.
- [ ] After a successful import, rename the deck on PonyRec and reload the game. The game still
      shows the name it was imported with — the snapshot, not the live deck.
- [ ] Set that deck to Private on PonyRec and reload the game. The game is unaffected.

## Seats surviving

- [ ] Refresh: you are still the same seat, and the presence count does not double.
- [ ] Open a second tab in the same browser on the same game. You are the same seat, and the other
      player still sees exactly one of you.
- [ ] Quit and reopen the browser. You are still your seat (the session cookie survives).
- [ ] A browser that never claimed a seat and opens the game watches; it cannot act.

## Cancelling

- [ ] As host, cancel a game nobody has joined: the button asks a second time, then the game
      disappears and the invite link 404s.
- [ ] With the invite link open in the second browser, cancel from the first. The second browser
      says the host cancelled it **without a refresh**, and stops offering the seat.
- [ ] The cancel button is gone once someone has joined, and so is the guest's — neither seat is
      offered it.

## Nothing MLP-specific leaked in

- [ ] Nothing in the pages or the API responses names a lane, a Plan, a Scene or a Story stage.
      The only game-specific thing visible is the setup's name.
