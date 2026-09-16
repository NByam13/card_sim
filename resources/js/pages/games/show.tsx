import { Head, useForm } from '@inertiajs/react';
import { useEchoPresence } from '@laravel/echo-react';
import { FormEvent, useEffect, useState } from 'react';

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
}

interface Member {
  id: string;
  role: Role;
  name: string | null;
}

interface Props {
  game: Game;
  seat: Seat | null;
  resumeUrl: string | null;
  inviteUrl: string;
  canJoin: boolean;
}

/**
 * A game before play starts: who is seated, who is here, and the link that
 * brings the second player in.
 *
 * Presence is the live part. A member is a browser, not a person, so two tabs of
 * the same seat appear once.
 */
export default function Show({ game, seat, resumeUrl, inviteUrl, canJoin }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const { channel } = useEchoPresence(`game.${game.code}`, []);

  useEffect(() => {
    const presence = channel();
    if (!presence) return;

    presence
      .here((here: Member[]) => setMembers(here))
      .joining((member: Member) => setMembers((current) => [...current, member]))
      .leaving((member: Member) =>
        setMembers((current) => current.filter((m) => m.id !== member.id))
      )
      .error((error: unknown) => console.error('game channel subscription failed', error));
  }, [channel]);

  const present = (role: Role) => members.some((m) => m.role === role);
  const watching = members.filter((m) => m.role === 'spectator').length;

  return (
    <>
      <Head title={seat ? 'Your game' : 'Watching'} />
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-12">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {game.status === 'waiting' ? 'Waiting for a second player' : 'Both players seated'}
          </h1>
          <p className="text-sm text-gray-600">
            {seat ? `You are the ${seat}.` : 'You are watching this game.'}
          </p>
        </header>

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

        {game.status === 'waiting' && seat !== null && <InviteLink url={inviteUrl} />}
        {canJoin && <JoinForm code={game.code} />}
        {resumeUrl && <ResumeLink url={resumeUrl} />}
      </div>
    </>
  );
}

function InviteLink({ url }: { url: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Invite your opponent</h2>
      <p className="text-xs text-gray-500">Anyone with this link can take the free seat.</p>
      <code className="block overflow-x-auto rounded bg-gray-100 px-3 py-2 text-xs">{url}</code>
    </section>
  );
}

function ResumeLink({ url }: { url: string }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">Play from another device</h2>
      <p className="text-xs text-gray-500">
        This link carries your seat. Keep it to yourself — anyone who opens it becomes you in this
        game.
      </p>
      <code className="block overflow-x-auto rounded bg-gray-100 px-3 py-2 text-xs">{url}</code>
    </section>
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
