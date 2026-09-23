import { destroy } from '@/actions/App/Http/Controllers/GameController';
import BoardArena from '@/board/components/BoardArena';
import ZoomControls from '@/board/components/ZoomControls';
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
  /** This seat's own deck snapshot, to deal its board from. Null for a watcher. */
  deck: Deck | null;
}

interface Member {
  id: string;
  role: Role;
  name: string | null;
}

interface Props {
  game: Game;
  seat: Seat | null;
  inviteUrl: string;
  canJoin: boolean;
  canCancel: boolean;
}

/**
 * A game: the lobby until you hold a seat, then your half of the table.
 *
 * A watcher stays on the lobby — there is nothing to show them until the sync
 * slice gives them a board to mirror.
 */
export default function Show({ game, seat, inviteUrl, canJoin, canCancel }: Props) {
  const [cancelled, setCancelled] = useState(false);

  // Stable, so the channel's handlers are bound once rather than on every
  // render of this page.
  const onCancelled = useCallback(() => setCancelled(true), []);

  if (!cancelled && seat && game.deck) {
    return <Playing game={game} seat={seat} deck={game.deck} onCancelled={onCancelled} />;
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
            {canCancel && <CancelGame code={game.code} />}
          </>
        )}
      </div>
    </>
  );
}

/**
 * Your half of the table.
 *
 * The board fills the screen rather than sitting inside the lobby's column: it
 * is the page now, and the lobby's chrome would cost height the table needs.
 * The presence strip rides along in the header, which the shell scrolls.
 */
function Playing({
  game,
  seat,
  deck,
  onCancelled,
}: {
  game: Game;
  seat: Seat;
  deck: Deck;
  onCancelled: () => void;
}) {
  const [scale, setScale] = usePersistentZoom('board', 1);

  return (
    <>
      <Head title="Your game" />
      <div className="flex h-screen flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2">
          <Link href="/" className="text-xs font-semibold tracking-widest text-gray-500 uppercase">
            Everfree Arena
          </Link>
          <ZoomControls scale={scale} onChange={setScale} />
        </div>

        <BoardArena
          deck={deck}
          scale={scale}
          header={
            <div className="mb-3">
              <Table key={seat} game={game} seat={seat} onCancelled={onCancelled} />
            </div>
          }
        />
      </div>
    </>
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
  const { channel } = useEchoPresence(`game.${game.code}`, '.seat.claimed', () =>
    router.reload({ only: ['game', 'canJoin', 'canCancel'] })
  );

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
