import { format as changeFormat } from '@/actions/App/Http/Controllers/GameController';
import { MatchFormat } from '@/types/game';
import { router } from '@inertiajs/react';
import { useState } from 'react';

const OPTIONS: { value: MatchFormat; label: string; hint: string }[] = [
  { value: MatchFormat.Bo1, label: 'Best of 1', hint: 'One game decides it.' },
  { value: MatchFormat.Bo3, label: 'Best of 3', hint: 'First to two games.' },
];

/**
 * Bo1 or Bo3. Editable by the host until the match is live; everyone else sees
 * it read-only.
 */
export default function MatchFormatToggle({
  code,
  format,
  editable,
}: {
  code: string;
  format: MatchFormat;
  editable: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const active = OPTIONS.find((option) => option.value === format) ?? OPTIONS[0];

  const select = (value: MatchFormat) => {
    if (value === format) return;

    setBusy(true);
    router.patch(
      changeFormat.url(code),
      { format: value },
      {
        only: ['game', 'canChangeFormat'],
        preserveScroll: true,
        preserveState: true,
        onFinish: () => setBusy(false),
      }
    );
  };

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-500">Match format</p>
      <div
        role="group"
        aria-label="Match format"
        className="inline-flex rounded border border-gray-200 bg-gray-100 p-0.5"
      >
        {OPTIONS.map((option) => {
          const selected = option.value === format;

          return (
            <button
              key={option.value}
              type="button"
              disabled={!editable || busy}
              aria-pressed={selected}
              onClick={() => select(option.value)}
              className={`rounded px-3 py-1 text-xs font-medium ${
                selected ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              } ${editable && !selected ? 'hover:text-gray-900' : ''} ${
                editable ? '' : 'cursor-default'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">
        {editable ? active.hint : `${active.hint} The host picks the format.`}
      </p>
    </div>
  );
}
