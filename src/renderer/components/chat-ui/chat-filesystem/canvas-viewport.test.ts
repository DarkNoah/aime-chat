import type { Editor } from 'tldraw';
import { deferCanvasViewportUpdates } from './canvas-viewport';

let element: HTMLDivElement;
let nextFrame: FrameRequestCallback | undefined;
let update: jest.Mock;
let editor: Editor;
let cleanup: () => void;

beforeEach(() => {
  element = document.createElement('div');
  document.body.append(element);
  jest
    .spyOn(element, 'getBoundingClientRect')
    .mockReturnValue({ width: 800, height: 600 } as DOMRect);
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    nextFrame = callback;
    return 1;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
    nextFrame = undefined;
  });
  update = jest.fn(function original() {
    return this;
  });
  editor = { updateViewportScreenBounds: update } as unknown as Editor;
  cleanup = deferCanvasViewportUpdates(editor);
});
afterEach(() => {
  cleanup();
  element.remove();
  jest.restoreAllMocks();
});

function paint() {
  const callback = nextFrame;
  nextFrame = undefined;
  callback?.(0);
}

it('coalesces resize notifications and measures the latest bounds outside the observer cycle', () => {
  expect(editor.updateViewportScreenBounds(element)).toBe(editor);
  editor.updateViewportScreenBounds(element, true);
  expect(update).not.toHaveBeenCalled();
  expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  paint();
  expect(update).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith(element, true);
  expect(update.mock.contexts[0]).toBe(editor);
  editor.updateViewportScreenBounds(element);
  expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
});

it('cancels stale DOM measurements when explicit synchronous bounds are supplied', () => {
  editor.updateViewportScreenBounds(element);
  const bounds = { x: 10, y: 20, w: 500, h: 300 } as any;
  expect(editor.updateViewportScreenBounds(bounds, true)).toBe(editor);
  expect(update).toHaveBeenCalledWith(bounds, true);
  paint();
  expect(update).toHaveBeenCalledTimes(1);
});

it('skips hidden or removed tabs and can measure them again when visible', () => {
  editor.updateViewportScreenBounds(element);
  jest
    .mocked(element.getBoundingClientRect)
    .mockReturnValue({ width: 0, height: 0 } as DOMRect);
  paint();
  expect(update).not.toHaveBeenCalled();
  editor.updateViewportScreenBounds(element);
  element.remove();
  paint();
  expect(update).not.toHaveBeenCalled();
  document.body.append(element);
  jest
    .mocked(element.getBoundingClientRect)
    .mockReturnValue({ width: 500, height: 600 } as DOMRect);
  editor.updateViewportScreenBounds(element);
  paint();
  expect(update).toHaveBeenCalledTimes(1);
});

it('restores the original method and cancels the pending frame on unmount', () => {
  editor.updateViewportScreenBounds(element);
  cleanup();
  expect(editor.updateViewportScreenBounds).toBe(update);
  expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  paint();
  expect(update).not.toHaveBeenCalled();
});
