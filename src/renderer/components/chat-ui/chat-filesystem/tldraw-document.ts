import {
  createTLStore,
  DocumentRecordType,
  PageRecordType,
  TLDOCUMENT_ID,
  getIndexAbove,
  defaultBindingUtils,
  defaultShapeUtils,
  parseTldrawJsonFile,
  type TldrawFile,
} from 'tldraw';

export const CANVAS_FILE_LIMIT = 32 * 1024 * 1024;

function createCanvasStore() {
  return createTLStore({
    shapeUtils: defaultShapeUtils,
    bindingUtils: defaultBindingUtils,
  });
}

export function createEmptyCanvasDocument(): string {
  const store = createCanvasStore();
  store.put([
    DocumentRecordType.create({ id: TLDOCUMENT_ID, name: '' }),
    PageRecordType.create({
      id: PageRecordType.createId(),
      name: 'Page 1',
      index: getIndexAbove(null),
    }),
  ]);
  // .tldr format version 1 is the native file format in our pinned tldraw 3.15.5.
  const file: TldrawFile = {
    tldrawFileFormatVersion: 1,
    schema: store.schema.serialize(),
    records: store.allRecords(),
  };
  return JSON.stringify(file);
}

export function parseCanvasDocument(content: string) {
  const result = parseTldrawJsonFile({
    json: content,
    schema: createCanvasStore().schema,
  });
  if (result.ok === false) throw new Error(result.error.type);
  return result.value;
}

/** A saved canvas must not depend on transient object URLs or local image paths. */
export function assertEmbeddedCanvasAssets(content: string) {
  const file = JSON.parse(content) as TldrawFile;
  for (const record of file.records) {
    if (record.typeName === 'asset') {
      const asset = record as unknown as {
        type: string;
        props: { src?: string };
      };
      if (
        asset.type !== 'bookmark' &&
        asset.props.src &&
        !asset.props.src.startsWith('data:')
      ) {
        throw new Error('chat.canvas_asset_error');
      }
    }
  }
}
