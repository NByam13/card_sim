/**
 * A small bottom-centre toast, driven by the parent. The `error` tone is for
 * surfacing failures.
 */
export default function Toast({
  show,
  message,
  tone = 'default',
}: {
  show: boolean;
  message: string;
  tone?: 'default' | 'error';
}) {
  return (
    <div
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      role={tone === 'error' ? 'alert' : undefined}
      className={`pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center transition-all duration-300 ${
        show ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      }`}
    >
      <div
        className={`rounded-full px-5 py-2 text-sm font-semibold text-white shadow-lg ${
          tone === 'error' ? 'bg-red-600' : 'bg-slate-800'
        }`}
      >
        {message}
      </div>
    </div>
  );
}
