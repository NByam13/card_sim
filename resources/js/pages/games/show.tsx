import { accept, destroy } from '@/actions/App/Http/Controllers/GameController';
import BoardArena from '@/board/components/BoardArena';
import Modal from '@/components/Modal';
import MirrorBoard from '@/board/components/MirrorBoard';
import SeamBar from '@/board/components/SeamBar';
import { contactLane } from '@/board/mlp/turnTrack';
import { CompactGameState, expandState } from '@/board/sync/persist';
import { PublicState, TurnCursor, TurnOrder } from '@/board/sync/types';
import { useBoardRelay } from '@/board/sync/useBoardRelay';
import { Acceptance, lookupCard, useGameSync } from '@/board/sync/useGameSync';
import { useMirror } from '@/board/sync/useMirror';
import { useTurnCursor } from '@/board/sync/useTurnCursor';
import { useTurnOrder } from '@/board/sync/useTurnOrder';
import ZoomControls from '@/board/components/ZoomControls';
import { GameState } from '@/board/types';
import { usePersistentZoom } from '@/board/zoom';
import { Deck } from '@/types/cards';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { useEchoPresence } from '@laravel/echo-react';
import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';

type Seat = 'host' | 'guest';
type Role = Seat | 'spectator';

interface SeatState {
  name: string | null;
  deck_name: string | null;
  claimed: boolean;
}

interface Game {
  code: string;
  setup: string;
  status: 'waiting' | 'active' | 'finished';
  seats: Record<Seat, SeatState>;
  you: Seat | null;
  /** Which seats are ready to play each other. Both means the match is live. */
  accepted: Acceptance;
  /** This seat's own deck snapshot, to deal its board from. Null for a watcher. */
  deck: Deck | null;
  /** This seat's board as it was last saved, so a refresh resumes it. */
  saved_state: CompactGameState | null;
  /** The opponent's board as they last saved it, to seed their mirror. */
  opponent_state: PublicState | null;
}

interface Member {
  id: string;
  role: Role;
  name: string | null;
}

interface Props {
  game: Game;
  seat: Seat | null;
  cursor: TurnCursor;
  turnOrder: TurnOrder;
  inviteUrl: string;
  canJoin: boolean;
  canCancel: boolean;
}

/**
 * A game: the lobby until the table is worth showing, then your half of it.
 *
 * Holding a seat is not on its own enough to be sent to the board. A host who
 * has just opened a game still has to send the link, and the lobby is the only
 * place that offers it — dropping them straight onto the table stranded them
 * there with no invite and no way to cancel. So the lobby stays until the
 * second seat is taken, and a player who would rather not wait says so.
 *
 * A watcher stays on the lobby regardless — they get a board of their own to
 * mirror in the slice after this one.
 */
export default function Show({
  game,
  seat,
  cursor,
  turnOrder,
  inviteUrl,
  canJoin,
  canCancel,
}: Props) {
  const [cancelled, setCancelled] = useState(false);
  const [solo, setSolo] = useState(false);

  // Stable, so the channel's handlers are bound once rather than on every
  // render of this page.
  const onCancelled = useCallback(() => setCancelled(true), []);

  // The opponent arriving is itself a reason to show the table: the lobby's one
  // job was filling that seat. `seat.claimed` follows the row, not presence, so
  // this does not flap when they close a tab.
  const seated = game.seats.guest.claimed;

  if (!cancelled && seat && game.deck && (seated || solo)) {
    return (
      <Playing
        game={game}
        seat={seat}
        cursor={cursor}
        turnOrder={turnOrder}
        deck={game.deck}
        onWaitingRoom={seated ? null : () => setSolo(false)}
      />
    );
  }

  return (
    <>
      <Head title={seat ? 'Your game' : 'Watching'} />
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-12">
        <Link href="/" className="text-xs font-semibold tracking-widest text-gray-500 uppercase">
          Everfree Arena
        </Link>

        {cancelled ? (
          <Cancelled />
        ) : (
          <>
            <header className="space-y-1">
              <h1 className="text-2xl font-semibold">
                {game.status === 'waiting' ? 'Waiting for a second player' : 'Both players seated'}
              </h1>
              <p className="text-sm text-gray-600">
                {seat ? `You are the ${seat}.` : 'You are watching this game.'}
              </p>
            </header>

            {/*
              Keyed by seat, so claiming one remounts this and the channel is
              subscribed again. A subscription is authorized once, when it is
              made: the browser that joins as a watcher and then takes a seat
              would otherwise stay a watcher to everyone here, including itself.
            */}
            <Table key={seat ?? 'watching'} game={game} seat={seat} onCancelled={onCancelled} />

            <InviteLink url={inviteUrl} full={!canJoin && game.seats.guest.claimed} />
            {canJoin && <JoinForm code={game.code} />}
            {seat && game.deck && <PlaySolo onStart={() => setSolo(true)} />}
            {canCancel && <CancelGame code={game.code} />}
          </>
        )}
      </div>
    </>
  );
}

/**
 * The way onto the table before anyone else turns up.
 *
 * Waiting for an opponent is a courtesy rather than a requirement: you can deal
 * and play your own half while the seat is still open, and the invite link is a
 * click back. Taking it up is why starting a match is a handshake — whoever
 * takes the seat arrives to find you already mid-game.
 */
function PlaySolo({ onStart }: { onStart: () => void }) {
  return (
    <section className="space-y-2 rounded border border-gray-200 p-4">
      <h2 className="text-sm font-medium">Don&rsquo;t want to wait?</h2>
      <p className="text-xs text-gray-500">
        Deal your deck and play your own half now. Your opponent can still take the seat.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        Play solo &rarr;
      </button>
    </section>
  );
}

/**
 * Your half of the table, with the opponent's above it.
 *
 * The board fills the screen rather than sitting inside the lobby's column: it
 * is the page now, and the lobby's chrome would cost height the table needs.
 * The seat list goes with it — once two people are playing, the mirror says who
 * is there far better than a list of two names does.
 *
 * This holds the page's one channel subscription while playing. The lobby's
 * `Table` holds the other, and the two never exist at once: channels are
 * reference-counted, so a second subscription would keep the first alive across
 * the remount and the seat would never be re-authorized.
 */
function Playing({
  game,
  seat,
  cursor,
  turnOrder: servedTurnOrder,
  deck,
  onWaitingRoom,
}: {
  game: Game;
  seat: Seat;
  cursor: TurnCursor;
  turnOrder: TurnOrder;
  deck: Deck;
  /** Back to the lobby, or null once the second seat is taken and there is no lobby left to want. */
  onWaitingRoom: (() => void) | null;
}) {
  const [scale, setScale] = usePersistentZoom('board', 1);
  // The mirror is glanced at where your own board is worked on, so it keeps its
  // own scale and its own cookie.
  const [mirrorScale, setMirrorScale] = usePersistentZoom('opponent', 1);
  const opponent = seat === 'host' ? 'guest' : 'host';
  const seated = game.seats[opponent].claimed;

  // Props say what the server last recorded; the channel says what happened
  // since. Either can be the newer of the two, so the live answer is state.
  const [accepted, setAccepted] = useState<Acceptance>(game.accepted);
  useEffect(() => setAccepted(game.accepted), [game.accepted]);

  const matchLive = accepted.host && accepted.guest;
  const [liveOnMount] = useState(matchLive);
  // The other seat turning up while this board was on screen, as opposed to
  // already being there when the page loaded. Only the first is worth a modal.
  const [seatedOnMount] = useState(seated);
  const [declined, setDeclined] = useState(false);

  const { publish, announce } = useBoardRelay({
    code: game.code,
    relaying: matchLive,
    saving: game.status === 'active',
  });
  const { mirror, receive } = useMirror(lookupCard, game.opponent_state);
  const turn = useTurnCursor({ code: game.code, seat, cursor });
  const order = useTurnOrder({ code: game.code, turnOrder: servedTurnOrder });
  const firstPlayer = order.turnOrder.first_player;
  const { opponentPresent } = useGameSync({
    code: game.code,
    seat,
    onFrame: receive,
    onAnnounce: announce,
    onTurnAdvanced: turn.receive,
    onTurnOrderRolled: order.receiveRoll,
    onTurnOrderDecided: order.receiveDecided,
    // Presence cannot tell a watcher from the player who just sat down, and the
    // props this page is holding predate the claim either way.
    onSeatClaimed: useCallback(() => router.reload({ only: ['game'] }), []),
    onAccepted: useCallback((next: Acceptance) => {
      setAccepted(next);

      // The match going live discarded both solo boards on the server, and the
      // props this page still holds are the boards it discarded — including the
      // opponent's, which would otherwise seed the mirror with the game they
      // were playing by themselves.
      if (next.host && next.guest) {
        router.reload({ only: ['game'] });
      }
    }, []),
  });

  // The saved board is resolved once, against the deck it was dealt from. A card
  // that no longer resolves means the deck changed, and `expandState` returns
  // null so the board deals fresh rather than restoring half of one.
  const [restored] = useState<GameState | null>(() =>
    game.saved_state ? expandState(game.saved_state, deck) : null
  );

  // A match starting re-deals both halves, so the hand someone goldfished while
  // they waited does not become the hand they play. The key remounts the arena;
  // dropping the restore is what stops it dealing the discarded board again.
  const arenaKey = matchLive ? 'match' : 'solo';
  const savedState = matchLive && !liveOnMount ? null : restored;

  const acting = turn.cursor.active_seat ?? firstPlayer;
  const lane = contactLane(turn.cursor.turn_stop);

  const opponentName = seatNames(game)[opponent];
  // A full visit rather than a bare POST: the board deals fresh from props that
  // no longer carry a saved state, which is what accepting means.
  const acceptMatch = useCallback(() => router.post(accept.url(game.code)), [game.code]);

  return (
    <>
      <Head title="Your game" />
      <div className="flex h-screen flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2">
          <Link href="/" className="text-xs font-semibold tracking-widest text-gray-500 uppercase">
            Everfree Arena
          </Link>
          <div className="flex items-center gap-4">
            {/* The invite link and the cancel button live in the lobby, so while
                the seat is open there has to be a way back to it. */}
            {onWaitingRoom && (
              <button
                type="button"
                onClick={onWaitingRoom}
                title="The invite link and cancel live here."
                className="text-xs font-medium text-gray-500 underline hover:text-gray-900"
              >
                Waiting room
              </button>
            )}
            <ZoomControls scale={scale} onChange={setScale} />
          </div>
        </div>

        <BoardArena
          key={arenaKey}
          deck={deck}
          scale={scale}
          savedState={savedState}
          onState={publish}
          // Re-dealing your own opening in front of an opponent who does not
          // re-deal theirs is a way around the mulligan rules, so it is a solo
          // affordance only.
          canRestart={!matchLive}
          turnCursor={matchLive ? turn : undefined}
          goingFirst={matchLive ? (firstPlayer ? firstPlayer === seat : null) : undefined}
          opponentStarted={mirror?.started ?? false}
          rings={matchLive ? { acting: acting === seat, contactLane: lane } : undefined}
          seam={
            matchLive
              ? ({ onAdvance, waiting }) => (
                  <div className="mb-3">
                    <SeamBar
                      seat={seat}
                      names={seatNames(game)}
                      cursor={turn.cursor}
                      turnOrder={order.turnOrder}
                      onRoll={order.roll}
                      onElect={order.elect}
                      onAdvance={onAdvance}
                      waiting={waiting}
                    />
                  </div>
                )
              : undefined
          }
          header={
            seated ? (
              <div className="mb-3">
                {matchLive ? (
                  <MirrorBoard
                    state={mirror}
                    scale={mirrorScale}
                    onScaleChange={setMirrorScale}
                    backs={deck.card_backs ?? null}
                    name={opponentName}
                    present={opponentPresent}
                    goingFirst={firstPlayer ? firstPlayer !== seat : null}
                    rings={{ acting: acting === opponent, contactLane: lane }}
                  />
                ) : (
                  <MatchPending
                    name={opponentName}
                    youAccepted={accepted[seat]}
                    onAccept={acceptMatch}
                  />
                )}
              </div>
            ) : undefined
          }
        />
      </div>

      {/* Asked only of a seat the news reaches mid-game. Anyone who loads the
          page into this state gets the standing invitation above instead. */}
      {seated && !accepted[seat] && !seatedOnMount && !declined && (
        <MatchInviteModal
          name={opponentName}
          onAccept={acceptMatch}
          onDecline={() => setDeclined(true)}
        />
      )}
    </>
  );
}

function seatNames(game: Game): Record<Seat, string> {
  return {
    host: game.seats.host.name ?? 'Host',
    guest: game.seats.guest.name ?? 'Guest',
  };
}

/**
 * The opponent's half before there is one to show: either they have not agreed
 * to play yet, or you have not.
 *
 * It sits exactly where the mirror will, so the board does not jump when the
 * match starts and the space is never simply blank.
 */
function MatchPending({
  name,
  youAccepted,
  onAccept,
}: {
  name: string;
  /** You are waiting on them. The other way round, the next move is yours. */
  youAccepted: boolean;
  onAccept: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center">
      {youAccepted ? (
        <p className="text-sm text-gray-500">
          Waiting for <span className="font-medium text-gray-700">{name}</span> to accept the
          match&hellip;
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{name}</span> is waiting to play.
          </p>
          <p className="text-xs text-gray-500">Starting deals you a fresh hand.</p>
          <button
            type="button"
            onClick={onAccept}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            Start the match &rarr;
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The ask, for a player who is mid-game when the other seat is taken.
 *
 * Deliberately interrupting: they are looking at their own board and would
 * otherwise not notice that the game they opened is ready to start. Declining
 * costs them nothing and leaves the invitation standing above the board.
 */
function MatchInviteModal({
  name,
  onAccept,
  onDecline,
}: {
  name: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <Modal show onClose={onDecline} maxWidth="sm" labelledBy="match-invite-title">
      <div className="space-y-3 bg-white p-5">
        <h2 id="match-invite-title" className="text-lg font-semibold">
          {name} has taken the other seat
        </h2>
        <p className="text-sm text-gray-600">
          Start the match? You will both be dealt a fresh hand, so the board you are on now is
          cleared.
        </p>
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onDecline}
            className="text-sm font-medium text-gray-500 underline hover:text-gray-900"
          >
            Keep playing alone
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            Start the match
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * What is left when the host cancels: the row is gone, so there is nothing to
 * show and nothing to reload — only somewhere else to go.
 */
function Cancelled() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">The host cancelled this game</h1>
      <p className="text-sm text-gray-600">
        It was called off before both seats were taken.{' '}
        <Link href="/" className="font-medium underline">
          Start one of your own
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * The two seats and who is at them, live.
 *
 * Presence is one half of it: a member is a browser, not a person, so two tabs
 * of the same seat appear once. The other half is the game itself, which the
 * server re-sends whenever a seat is claimed — presence can only say who is
 * connected, never who the row says is seated.
 */
function Table({
  game,
  seat,
  onCancelled,
}: {
  game: Game;
  seat: Seat | null;
  onCancelled: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);

  // The page's one subscription, on purpose: channels are reference-counted, so
  // a second one here would keep the first alive through the remount above and
  // the seat would never be re-authorized.
  const { channel } = useEchoPresence(`game.${game.code}`, '.seat.claimed', () => {
    // Waiting here is accepting: this seat has no board for a match to start
    // underneath, so it is dropped straight onto the table. A seat that left for
    // solo play is not on this page and is asked instead.
    if (seat) {
      router.post(accept.url(game.code));
      return;
    }

    router.reload({ only: ['game', 'canJoin', 'canCancel'] });
  });

  useEffect(() => {
    const presence = channel();
    if (!presence) return;

    presence
      .here((here: Member[]) => setMembers(here))
      .joining((member: Member) => setMembers((current) => [...current, member]))
      .leaving((member: Member) =>
        setMembers((current) => current.filter((m) => m.id !== member.id))
      )
      .listen('.game.cancelled', onCancelled)
      .error((error: unknown) => console.error('game channel subscription failed', error));
  }, [channel, onCancelled]);

  const present = (role: Role) => members.some((m) => m.role === role);
  const watching = members.filter((m) => m.role === 'spectator').length;

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-gray-200 rounded border border-gray-200">
        {(['host', 'guest'] as Seat[]).map((which) => {
          const state = game.seats[which];
          return (
            <li key={which} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  {state.claimed ? state.name : 'Empty seat'}
                  {seat === which && <span className="ml-2 text-xs text-gray-500">you</span>}
                </p>
                <p className="text-xs text-gray-500">{state.deck_name ?? 'No deck yet'}</p>
              </div>
              <span className="text-xs text-gray-500">
                {present(which) ? 'here' : state.claimed ? 'away' : '—'}
              </span>
            </li>
          );
        })}
      </ul>

      {watching > 0 && (
        <p className="text-xs text-gray-500">
          {watching} {watching === 1 ? 'person is' : 'people are'} watching.
        </p>
      )}
    </div>
  );
}

/**
 * The same link does both jobs: it offers the free seat while one is open, and
 * brings spectators in once the game is full.
 */
function InviteLink({ url, full }: { url: string; full: boolean }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">{full ? 'Link to this game' : 'Invite your opponent'}</h2>
      <p className="text-xs text-gray-500">
        {full
          ? 'Both seats are taken. Anyone with this link can watch.'
          : 'Anyone with this link can take the free seat.'}
      </p>
      <div className="relative">
        <code className="block overflow-x-auto rounded bg-gray-100 py-2 pr-11 pl-3 text-xs leading-6">
          {url}
        </code>
        <CopyButton value={url} />
      </div>
    </section>
  );
}

/**
 * Sits inside the link box and copies it, turning into a green check for a
 * moment.
 *
 * The clipboard API needs a secure context and a permission that can be denied,
 * so a failure says so rather than claiming a copy that never happened — the
 * link is on screen either way, to select by hand.
 *
 * It carries the box's own background, so a link too long for the box passes
 * behind it rather than through it.
 */
function CopyButton({ value }: { value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;

    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  const label =
    state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy failed' : 'Copy link';

  return (
    <>
      <button
        type="button"
        onClick={copy}
        title={label}
        aria-label={label}
        className="absolute inset-y-0 right-0 flex items-center rounded-r bg-gray-100 px-2 text-gray-500 hover:text-gray-900"
      >
        {state === 'copied' ? (
          <CheckIcon className="size-4 text-green-600" />
        ) : state === 'failed' ? (
          <CrossIcon className="size-4 text-red-600" />
        ) : (
          <ClipboardIcon className="size-4" />
        )}
      </button>
      {/* Spoken, since the icon swap is the only other word of it. */}
      <span aria-live="polite" className="sr-only">
        {state === 'idle' ? '' : label}
      </span>
    </>
  );
}

function ClipboardIcon({ className }: { className: string }) {
  return (
    <Icon className={className}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Icon>
  );
}

function CheckIcon({ className }: { className: string }) {
  return (
    <Icon className={className}>
      <path d="m20 6-11 11-5-5" />
    </Icon>
  );
}

function CrossIcon({ className }: { className: string }) {
  return (
    <Icon className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

function Icon({ className, children }: { className: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/**
 * The host's way out of a game nobody joined.
 *
 * Asks twice rather than opening a dialog: the game is gone for good, and the
 * second click is cheaper to explain than a modal is to build.
 */
function CancelGame({ code }: { code: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs font-medium text-gray-500 underline hover:text-gray-900"
        >
          Cancel this game
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <p className="text-xs text-gray-600">Cancel this game? The link stops working.</p>
      <button
        type="button"
        onClick={() => router.delete(destroy.url(code))}
        className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
      >
        Cancel it
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs font-medium text-gray-500 underline hover:text-gray-900"
      >
        Keep it
      </button>
    </div>
  );
}

function JoinForm({ code }: { code: string }) {
  const form = useForm({ deck_code: '', name: '' });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    form.post(`/games/${code}/join`);
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded border border-gray-200 p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Take the free seat</h2>
        <p className="text-xs text-gray-500">Paste the code of an Unlisted deck on PonyRec.</p>
      </div>

      <div className="space-y-1">
        <input
          value={form.data.deck_code}
          onChange={(event) => form.setData('deck_code', event.target.value)}
          placeholder="Deck code"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
        />
        {form.errors.deck_code && <p className="text-sm text-red-600">{form.errors.deck_code}</p>}
      </div>

      <div className="space-y-1">
        <input
          value={form.data.name}
          onChange={(event) => form.setData('name', event.target.value)}
          placeholder="Your name (optional)"
          maxLength={40}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {form.errors.name && <p className="text-sm text-red-600">{form.errors.name}</p>}
      </div>

      <button
        type="submit"
        disabled={form.processing}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {form.processing ? 'Loading your deck…' : 'Join'}
      </button>
    </form>
  );
}
