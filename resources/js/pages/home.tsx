import { Head, useForm } from '@inertiajs/react';
import { FormEvent } from 'react';

/**
 * The front door: open a game with a PonyRec deck code, or paste a link to one
 * someone sent you. No sign-in, because there is nothing to sign in to.
 */
export default function Home() {
  const form = useForm({ deck_code: '', name: '' });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    form.post('/games');
  };

  return (
    <>
      <Head title="Play" />
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-4 py-12">
        <header className="space-y-2">
          <p className="text-xs font-semibold tracking-widest text-gray-500 uppercase">
            Everfree Arena
          </p>
          <h1 className="text-2xl font-semibold">Start a game</h1>
          <p className="text-sm text-gray-600">
            Bring a deck from PonyRec. Make it <strong>Unlisted</strong> there, then paste its code
            here. Nothing is saved about you, and there is no account to make.
          </p>
        </header>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="deck_code" className="block text-sm font-medium">
              Deck code
            </label>
            <input
              id="deck_code"
              value={form.data.deck_code}
              onChange={(event) => form.setData('deck_code', event.target.value)}
              placeholder="k3j9x0q2m1ab"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
            />
            {form.errors.deck_code && (
              <p className="text-sm text-red-600">{form.errors.deck_code}</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="name" className="block text-sm font-medium">
              Name <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <input
              id="name"
              value={form.data.name}
              onChange={(event) => form.setData('name', event.target.value)}
              placeholder="What your opponent sees"
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
            {form.processing ? 'Loading your deck…' : 'Open a game'}
          </button>
        </form>

        <p className="text-sm text-gray-600">
          Joining someone? Open the link they sent you — it has the game in it.
        </p>
      </div>
    </>
  );
}
