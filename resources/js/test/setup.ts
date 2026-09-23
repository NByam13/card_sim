// Registers jest-dom matchers (toBeInTheDocument, toHaveValue, …) on Vitest's
// expect, and runs RTL's automatic cleanup between tests. Loaded via
// `setupFiles` in vitest.config.ts.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not implement ResizeObserver, and any component that measures its
// own width to lay out (the Hand and Scene Zone fans) constructs one on mount.
// A no-op stub is enough: jsdom reports every element as 0x0 anyway, so a real
// implementation would have nothing to report either. Components must therefore
// render sensibly at width 0, which is also their true first-paint state.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

// jsdom does not implement elementFromPoint either. It has no layout, so null
// ("nothing is under that point") is the only honest answer it could give, and
// that is exactly how the board reads it: cursor over bare board. Tests that
// care about a real hit test stub this themselves.
if (typeof document !== 'undefined' && !document.elementFromPoint) {
  document.elementFromPoint = () => null;
}

// jsdom parses <dialog> but implements none of its behaviour, so `showModal()`
// throws. The top layer, the focus trap and inertness are all layout and
// browser-chrome concerns jsdom has no notion of; what a test can observe is
// whether the dialog is open, so that is what these stubs keep true.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    // Real `close()` fires this, and React's onClose is bound to it.
    this.dispatchEvent(new Event('close'));
  };
}

afterEach(() => {
  cleanup();
});
