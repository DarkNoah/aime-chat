import type { Editor } from 'tldraw';

/**
 * tldraw 3.15's useScreenBounds updates the editor synchronously from its
 * ResizeObserver. Crossing a UI breakpoint can then mount/resize observed
 * toolbar controls in the same delivery cycle. Defer only DOM measurements
 * on this editor instance; explicit Box updates keep their synchronous API.
 */
export function deferCanvasViewportUpdates(editor: Editor): () => void {
  const original = editor.updateViewportScreenBounds;
  let frame: number | undefined;
  let pending: [HTMLElement, boolean | undefined] | undefined;

  const cancel = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    pending = undefined;
  };

  const update: Editor['updateViewportScreenBounds'] = function update(
    bounds,
    center,
  ) {
    if (!(bounds instanceof HTMLElement)) {
      cancel();
      return original.call(this, bounds, center);
    }
    pending = [bounds, center];
    if (frame === undefined) {
      frame = requestAnimationFrame(() => {
        frame = undefined;
        const measurement = pending;
        pending = undefined;
        // A tab may have been hidden or removed since the notification.
        if (!measurement || !measurement[0].isConnected) return;
        const rect = measurement[0].getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        original.call(editor, ...measurement);
      });
    }
    return this;
  };

  editor.updateViewportScreenBounds = update;
  return () => {
    cancel();
    if (editor.updateViewportScreenBounds === update) {
      editor.updateViewportScreenBounds = original;
    }
  };
}
