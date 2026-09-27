/** @jest-environment node */
import {
  createEmptyCanvasDocument,
  parseCanvasDocument,
  assertEmbeddedCanvasAssets,
} from './tldraw-document';

it('creates a native tldraw document that the installed SDK can reopen', () => {
  const content = createEmptyCanvasDocument();
  const store = parseCanvasDocument(content);
  expect(store.allRecords().some((record) => record.typeName === 'page')).toBe(
    true,
  );
  expect(
    store.allRecords().some((record) => record.typeName === 'document'),
  ).toBe(true);
});

it.each([
  '',
  '{}',
  '{invalid',
  '{"tldrawFileFormatVersion":999,"schema":{},"records":[]}',
])('rejects invalid or incompatible documents: %s', (content) => {
  expect(() => parseCanvasDocument(content)).toThrow();
});

it('refuses to save unresolved assets that would disappear after reopening', () => {
  const file = (src: string) =>
    JSON.stringify({
      records: [{ typeName: 'asset', type: 'image', props: { src } }],
    });
  expect(() => assertEmbeddedCanvasAssets(file('blob:temporary'))).toThrow();
  expect(() => assertEmbeddedCanvasAssets(file('file:///tmp/a.png'))).toThrow();
  expect(() =>
    assertEmbeddedCanvasAssets(file('data:image/png;base64,YQ==')),
  ).not.toThrow();
});
