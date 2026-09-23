import { PropsWithChildren, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * A centred dialog over a dimmed page.
 *
 * PonyRec's equivalent is built on Headless UI. This one is not: the board needs
 * a panel, a backdrop, Escape and a focus trap, and pulling in a component
 * library for that would be the app's largest frontend dependency bought for one
 * screen. Built on the platform's own `<dialog>`, which brings the trap, the
 * backdrop semantics and Escape with it.
 *
 * The transitions are dropped with the library. A pile viewer is opened to be
 * read, not admired, and it appears instantly instead of fading.
 */
export default function Modal({
  children,
  show,
  onClose,
  maxWidth = '2xl',
  closeable = true,
  labelledBy,
}: PropsWithChildren<{
  show: boolean;
  onClose: () => void;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  closeable?: boolean;
  /** id of the element naming this dialog, for screen readers. */
  labelledBy?: string;
}>) {
  const ref = useRef<HTMLDialogElement>(null);

  // `showModal()` is what makes this a modal rather than a styled div: it takes
  // the top layer, traps focus, and makes the rest of the page inert. Calling it
  // on an already-open dialog throws, hence the guard.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (show && !dialog.open) {
      dialog.showModal();
    } else if (!show && dialog.open) {
      dialog.close();
    }
  }, [show]);

  if (!show) {
    return null;
  }

  const maxWidthClass = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
    '2xl': 'sm:max-w-2xl',
  }[maxWidth];

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      // Escape fires `cancel` before `close`; refusing it there is what makes
      // `closeable={false}` hold.
      onCancel={(e) => {
        if (!closeable) {
          e.preventDefault();
          return;
        }
        onClose();
      }}
      onClose={onClose}
      // Clicking the backdrop lands on the dialog itself, since its children sit
      // inside the panel below — so the target being the dialog means the click
      // missed the panel.
      onClick={(e) => {
        if (closeable && e.target === ref.current) onClose();
      }}
      className={`m-auto w-full bg-transparent p-4 backdrop:bg-gray-500/75 ${maxWidthClass}`}
    >
      <div className="overflow-hidden rounded-lg bg-white shadow-xl">{children}</div>
    </dialog>,
    document.body
  );
}
