/* eslint-disable no-continue */
import { BaseLoader } from './base-loader';
import * as xlsx from 'xlsx';

export type ExcelMode = 'text' | 'markdown';

export type ExcelLoaderOptions = {
  maxRow?: number;
  maxColumn?: number;
  maxCellLength?: number;
  maxSheet?: number;
  mode?: ExcelMode;
  sheet?: string;
  sheetIndex?: number;
  range?: string;
};

export type ExcelSheetPreviewMetadata = {
  range: string;
  declaredRange: string;
  effectiveRange: string;
  requestedRange?: string;
  rowCount: number;
  columnCount: number;
  omittedRowCount: number;
  omittedColumnCount: number;
  truncatedCellCount: number;
  workbookSheetCount?: number;
  workbookSheetIndex?: number;
  omittedSheetCount?: number;
};

export type ExcelSheetDocument = {
  id: string;
  pageContent: string;
  metadata: ExcelSheetPreviewMetadata;
};

type ExcelWorksheetPreviewOptions = Pick<
  ExcelLoaderOptions,
  'maxRow' | 'maxColumn' | 'maxCellLength' | 'mode' | 'range'
>;

type DenseRow = Array<xlsx.CellObject | undefined>;
type DenseWorksheet = Array<DenseRow | undefined> & {
  '!ref'?: string;
};
type WorksheetLike = xlsx.WorkSheet | DenseWorksheet;

type WorksheetCell = {
  row: number;
  column: number;
  cell: xlsx.CellObject;
};

type SampledIndices = {
  indices: number[];
  headCount: number;
  omittedCount: number;
};

type IndexTracker = {
  seen: Set<number>;
  head: number[];
  tail: number[];
  headLimit: number;
  tailLimit: number;
};

const DEFAULT_MAX_ROWS = 15;
const DEFAULT_MAX_COLUMNS = 30;
const DEFAULT_MAX_CELL_LENGTH = 500;
const DEFAULT_MAX_OUTPUT_LENGTH = 20_000;
const MAX_EXCEL_ROW_INDEX = 1_048_575;
const MAX_EXCEL_COLUMN_INDEX = 16_383;
const SPARSE_CELL_KEY_PATTERN = /^[A-Z]{1,3}[1-9]\d{0,6}$/i;
const ARRAY_INDEX_PATTERN = /^(0|[1-9]\d*)$/;
const USER_CELL_PATTERN = /^\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6})$/;
const CELL_TYPES = new Set(['b', 'n', 'e', 's', 'd', 'z']);
const WORKBOOK_READ_OPTIONS: xlsx.ParsingOptions = {
  type: 'buffer',
  dense: false,
  cellFormula: true,
  cellText: true,
  cellHTML: false,
  cellStyles: false,
  // Styled empty cells are the main source of inflated used ranges. Formula
  // cells with cached values are still retained without materializing stubs.
  sheetStubs: false,
};

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function formatWorksheetNames(names: string[], limit: number = 20): string {
  if (names.length === 0) return '(none)';
  const visible = names.slice(0, limit).join(', ');
  const omitted = names.length - limit;
  return omitted > 0 ? `${visible}, ... (${omitted} more)` : visible;
}

function isCellObject(value: unknown): value is xlsx.CellObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const type = (value as { t?: unknown }).t;
  return typeof type === 'string' && CELL_TYPES.has(type);
}

function parseArrayIndex(value: string, max: number): number | undefined {
  if (!ARRAY_INDEX_PATTERN.test(value)) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) {
    return undefined;
  }
  return parsed;
}

function* iterateWorksheetCells(
  worksheet: WorksheetLike,
): Generator<WorksheetCell> {
  if (Array.isArray(worksheet)) {
    const denseWorksheet = worksheet as DenseWorksheet;
    for (const rowKey in denseWorksheet) {
      if (!Object.prototype.hasOwnProperty.call(denseWorksheet, rowKey)) {
        continue;
      }
      const row = parseArrayIndex(rowKey, MAX_EXCEL_ROW_INDEX);
      if (row === undefined) continue;
      const denseRow = denseWorksheet[row];
      if (!Array.isArray(denseRow)) continue;

      for (const columnKey in denseRow) {
        if (!Object.prototype.hasOwnProperty.call(denseRow, columnKey)) {
          continue;
        }
        const column = parseArrayIndex(columnKey, MAX_EXCEL_COLUMN_INDEX);
        if (column === undefined) continue;
        const cell = denseRow[column];
        if (!isCellObject(cell)) continue;
        yield { row, column, cell };
      }
    }
    return;
  }

  const sparseWorksheet = worksheet as xlsx.WorkSheet;
  for (const address in sparseWorksheet) {
    if (!Object.prototype.hasOwnProperty.call(sparseWorksheet, address)) {
      continue;
    }
    if (!SPARSE_CELL_KEY_PATTERN.test(address)) continue;
    const cell = sparseWorksheet[address];
    if (!isCellObject(cell)) continue;
    const position = xlsx.utils.decode_cell(address.toUpperCase());
    if (
      position.r < 0 ||
      position.r > MAX_EXCEL_ROW_INDEX ||
      position.c < 0 ||
      position.c > MAX_EXCEL_COLUMN_INDEX
    ) {
      continue;
    }
    yield { row: position.r, column: position.c, cell };
  }
}

function decodeUserCell(value: string): xlsx.CellAddress {
  const match = USER_CELL_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid Excel cell reference '${value}'. Expected A1 notation such as A1 or H50.`,
    );
  }

  const address = xlsx.utils.decode_cell(
    `${match[1].toUpperCase()}${match[2]}`,
  );
  if (
    address.r < 0 ||
    address.r > MAX_EXCEL_ROW_INDEX ||
    address.c < 0 ||
    address.c > MAX_EXCEL_COLUMN_INDEX
  ) {
    throw new Error(`Excel cell reference '${value}' is out of bounds.`);
  }
  return address;
}

function encodeRange(range: xlsx.Range): string {
  if (range.s.r === range.e.r && range.s.c === range.e.c) {
    return xlsx.utils.encode_cell(range.s);
  }
  return xlsx.utils.encode_range(range);
}

function decodeUserRange(value: string): {
  range: xlsx.Range;
  label: string;
} {
  const parts = value.trim().split(':');
  if (parts.length < 1 || parts.length > 2 || parts.some((part) => !part)) {
    throw new Error(
      `Invalid Excel range '${value}'. Expected A1 notation such as A1 or A1:H50.`,
    );
  }

  const start = decodeUserCell(parts[0]);
  const end = decodeUserCell(parts[1] ?? parts[0]);
  if (start.r > end.r || start.c > end.c) {
    throw new Error(
      `Invalid Excel range '${value}'. The range must run from top-left to bottom-right.`,
    );
  }

  const range = { s: start, e: end };
  return { range, label: encodeRange(range) };
}

function isWithinRange(cell: WorksheetCell, range?: xlsx.Range): boolean {
  if (!range) return true;
  return (
    cell.row >= range.s.r &&
    cell.row <= range.e.r &&
    cell.column >= range.s.c &&
    cell.column <= range.e.c
  );
}

function normalizeFormula(formula: string): string {
  return formula.startsWith('=') ? formula : `=${formula}`;
}

function getReadableCellValue(cell: xlsx.CellObject): string | undefined {
  const formula =
    typeof cell.f === 'string' && cell.f.length > 0
      ? normalizeFormula(cell.f)
      : undefined;

  if (cell.t === 'z' && !formula) return undefined;

  let display = '';
  if (cell.t !== 'z') {
    try {
      display = xlsx.utils.format_cell(cell);
    } catch {
      const raw = cell.v;
      if (raw === undefined || raw === null) {
        display = '';
      } else if (raw instanceof Date) {
        display = raw.toISOString();
      } else {
        display = String(raw);
      }
    }
  }

  if (display.trim() !== '') return display;
  return formula;
}

function insertSorted(values: number[], value: number): void {
  let index = 0;
  while (index < values.length && values[index] < value) index += 1;
  values.splice(index, 0, value);
}

function createIndexTracker(limit: number): IndexTracker {
  return {
    seen: new Set<number>(),
    head: [],
    tail: [],
    headLimit: Math.ceil(limit / 2),
    tailLimit: Math.floor(limit / 2),
  };
}

function addTrackedIndex(tracker: IndexTracker, value: number): void {
  if (tracker.seen.has(value)) return;
  tracker.seen.add(value);

  if (tracker.headLimit > 0) {
    insertSorted(tracker.head, value);
    if (tracker.head.length > tracker.headLimit) tracker.head.pop();
  }
  if (tracker.tailLimit > 0) {
    insertSorted(tracker.tail, value);
    if (tracker.tail.length > tracker.tailLimit) tracker.tail.shift();
  }
}

function sampleTrackedIndices(tracker: IndexTracker): SampledIndices {
  const indices = [...new Set([...tracker.head, ...tracker.tail])].sort(
    (left, right) => left - right,
  );
  const omittedCount = Math.max(0, tracker.seen.size - indices.length);
  const headCount = omittedCount > 0 ? tracker.head.length : indices.length;
  return { indices, headCount, omittedCount };
}

function sampleOrderedValues(values: number[], limit: number): number[] {
  if (values.length <= limit) return values;
  const headCount = Math.ceil(limit / 2);
  const tailCount = Math.floor(limit / 2);
  return [
    ...values.slice(0, headCount),
    ...(tailCount > 0 ? values.slice(-tailCount) : []),
  ];
}

function selectPreviewColumns(
  worksheet: WorksheetLike,
  requestedRange: xlsx.Range | undefined,
  selectedRows: number[],
  maxColumns: number,
  populatedColumnCount: number,
): SampledIndices {
  const selectedRowSet = new Set(selectedRows);
  const candidateTracker = createIndexTracker(maxColumns);
  const representativeColumnByRow = new Map<number, number>();

  for (const worksheetCell of iterateWorksheetCells(worksheet)) {
    if (!isWithinRange(worksheetCell, requestedRange)) continue;
    if (!selectedRowSet.has(worksheetCell.row)) continue;
    if (getReadableCellValue(worksheetCell.cell) === undefined) continue;

    addTrackedIndex(candidateTracker, worksheetCell.column);
    const existing = representativeColumnByRow.get(worksheetCell.row);
    if (existing === undefined || worksheetCell.column < existing) {
      representativeColumnByRow.set(worksheetCell.row, worksheetCell.column);
    }
  }

  const rowsToCover = sampleOrderedValues(
    selectedRows.filter((row) => representativeColumnByRow.has(row)),
    maxColumns,
  );
  const selectedColumnSet = new Set<number>();
  for (const row of rowsToCover) {
    const representative = representativeColumnByRow.get(row);
    if (representative !== undefined) selectedColumnSet.add(representative);
  }

  const candidateColumns = sampleTrackedIndices(candidateTracker).indices;
  for (const column of candidateColumns) {
    if (selectedColumnSet.size >= maxColumns) break;
    selectedColumnSet.add(column);
  }

  const indices = [...selectedColumnSet].sort((left, right) => left - right);
  const omittedCount = Math.max(0, populatedColumnCount - indices.length);
  return {
    indices,
    headCount:
      omittedCount > 0 ? Math.ceil(indices.length / 2) : indices.length,
    omittedCount,
  };
}

function truncateCell(
  value: string,
  maxLength: number,
): {
  value: string;
  truncated: boolean;
} {
  if (value.length <= maxLength) return { value, truncated: false };
  const marker = '… [cell truncated]';
  const prefixLength = Math.max(0, maxLength - marker.length);
  return {
    value: `${value.slice(0, prefixLength)}${marker}`.slice(0, maxLength),
    truncated: true,
  };
}

function escapeCell(value: unknown, mode: ExcelMode): string {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (mode === 'markdown') {
    return stringValue
      .replace(/\\/g, '\\\\')
      .replace(/\|/g, '\\|')
      .replace(/\r\n|\n|\r/g, '<br>');
  }
  return stringValue.replace(/\r\n|\n|\r/g, '\\n').replace(/\t/g, ' ');
}

function wrapMarkdownCodeBlock(value: string): string {
  const backtickRuns: string[] = value.match(/`+/g) ?? [];
  const longestBacktickRun = backtickRuns.reduce<number>(
    (longest, run) => Math.max(longest, run.length),
    0,
  );
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}markdown\n${value}\n${fence}`;
}

function findUnclosedCodeFence(value: string): string | undefined {
  let openFence: string | undefined;
  for (const line of value.split('\n')) {
    const match = /^(`{3,})(?:markdown)?\s*$/.exec(line);
    if (!match) continue;
    const [, currentFence] = match;
    if (!openFence) {
      openFence = currentFence;
    } else if (currentFence.length >= openFence.length) {
      openFence = undefined;
    }
  }
  return openFence;
}

function insertOmissionMarker(
  indices: number[],
  headCount: number,
  omittedCount: number,
): Array<number | { omitted: number }> {
  if (omittedCount === 0) return indices;
  return [
    ...indices.slice(0, headCount),
    { omitted: omittedCount },
    ...indices.slice(headCount),
  ];
}

function renderPreview(
  values: Map<string, string>,
  rows: SampledIndices,
  columns: SampledIndices,
  mode: ExcelMode,
): string {
  const rowItems = insertOmissionMarker(
    rows.indices,
    rows.headCount,
    rows.omittedCount,
  );
  const columnItems = insertOmissionMarker(
    columns.indices,
    columns.headCount,
    columns.omittedCount,
  );

  const columnLabels = columnItems.map((column) =>
    typeof column === 'number'
      ? xlsx.utils.encode_col(column)
      : `… ${column.omitted} columns omitted …`,
  );

  if (mode === 'text') {
    const lines = [['Excel row', ...columnLabels].join('\t')];
    for (const row of rowItems) {
      if (typeof row !== 'number') {
        lines.push(
          [
            `… ${row.omitted} rows omitted …`,
            ...columnItems.map(() => '…'),
          ].join('\t'),
        );
        continue;
      }
      const cells = columnItems.map((column) =>
        typeof column === 'number'
          ? escapeCell(values.get(`${row}:${column}`) ?? '', mode)
          : '…',
      );
      lines.push([String(row + 1), ...cells].join('\t'));
    }
    return lines.join('\n');
  }

  const lines: string[] = [];
  lines.push(
    `| ${['Excel row', ...columnLabels]
      .map((value) => escapeCell(value, mode))
      .join(' | ')} |`,
  );
  lines.push(
    `| ${Array(columnItems.length + 1)
      .fill('---')
      .join(' | ')} |`,
  );

  for (const row of rowItems) {
    if (typeof row !== 'number') {
      lines.push(
        `| ${[
          `… ${row.omitted} rows omitted …`,
          ...columnItems.map(() => '…'),
        ].join(' | ')} |`,
      );
      continue;
    }

    const cells = columnItems.map((column) =>
      typeof column === 'number'
        ? escapeCell(values.get(`${row}:${column}`) ?? '', mode)
        : '…',
    );
    lines.push(`| ${[String(row + 1), ...cells].join(' | ')} |`);
  }
  return lines.join('\n');
}

export function buildWorksheetPreview(
  worksheet: WorksheetLike,
  options: ExcelWorksheetPreviewOptions = {},
): Omit<ExcelSheetDocument, 'id'> {
  const mode = options.mode ?? 'markdown';
  const maxRows = normalizeLimit(options.maxRow, DEFAULT_MAX_ROWS);
  const maxColumns = normalizeLimit(options.maxColumn, DEFAULT_MAX_COLUMNS);
  const maxCellLength = normalizeLimit(
    options.maxCellLength,
    DEFAULT_MAX_CELL_LENGTH,
  );
  const requested = options.range ? decodeUserRange(options.range) : undefined;
  const rowTracker = createIndexTracker(maxRows);
  const columnTracker = createIndexTracker(maxColumns);

  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = Number.NEGATIVE_INFINITY;
  let minColumn = Number.POSITIVE_INFINITY;
  let maxColumn = Number.NEGATIVE_INFINITY;

  for (const worksheetCell of iterateWorksheetCells(worksheet)) {
    if (!isWithinRange(worksheetCell, requested?.range)) continue;
    if (getReadableCellValue(worksheetCell.cell) === undefined) continue;
    addTrackedIndex(rowTracker, worksheetCell.row);
    addTrackedIndex(columnTracker, worksheetCell.column);
    minRow = Math.min(minRow, worksheetCell.row);
    maxRow = Math.max(maxRow, worksheetCell.row);
    minColumn = Math.min(minColumn, worksheetCell.column);
    maxColumn = Math.max(maxColumn, worksheetCell.column);
  }

  const sampledRows = sampleTrackedIndices(rowTracker);
  const selectedRows = new Set(sampledRows.indices);
  const sampledColumns = selectPreviewColumns(
    worksheet,
    requested?.range,
    sampledRows.indices,
    maxColumns,
    columnTracker.seen.size,
  );
  const selectedColumns = new Set(sampledColumns.indices);
  const values = new Map<string, string>();
  let truncatedCellCount = 0;

  if (rowTracker.seen.size > 0 && columnTracker.seen.size > 0) {
    for (const worksheetCell of iterateWorksheetCells(worksheet)) {
      if (!isWithinRange(worksheetCell, requested?.range)) continue;
      if (
        !selectedRows.has(worksheetCell.row) ||
        !selectedColumns.has(worksheetCell.column)
      ) {
        continue;
      }
      const readable = getReadableCellValue(worksheetCell.cell);
      if (readable === undefined) continue;
      const truncated = truncateCell(readable, maxCellLength);
      if (truncated.truncated) truncatedCellCount += 1;
      values.set(
        `${worksheetCell.row}:${worksheetCell.column}`,
        truncated.value,
      );
    }
  }

  const effectiveRange =
    rowTracker.seen.size === 0 || columnTracker.seen.size === 0
      ? 'NULL'
      : encodeRange({
          s: { r: minRow, c: minColumn },
          e: { r: maxRow, c: maxColumn },
        });
  const declaredRange =
    typeof worksheet['!ref'] === 'string' ? worksheet['!ref'] : 'NULL';
  const pageContent =
    rowTracker.seen.size === 0 || columnTracker.seen.size === 0
      ? ''
      : renderPreview(values, sampledRows, sampledColumns, mode);

  return {
    pageContent,
    metadata: {
      range: effectiveRange,
      declaredRange,
      effectiveRange,
      ...(requested ? { requestedRange: requested.label } : {}),
      rowCount: rowTracker.seen.size,
      columnCount: columnTracker.seen.size,
      omittedRowCount: sampledRows.omittedCount,
      omittedColumnCount: sampledColumns.omittedCount,
      truncatedCellCount,
    },
  };
}

function limitExcelOutput(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  const reminder =
    '\n\n<system-reminder>Excel preview exceeded the total output limit and was truncated. Call Read again with args containing sheet or sheetIndex and an optional range, for example args: \'{"sheetIndex":9,"range":"A1:H50"}\'.</system-reminder>';
  if (reminder.length >= maxLength) return reminder.slice(0, maxLength);

  const prefixBudget = maxLength - reminder.length;
  let prefix = value.slice(0, prefixBudget);
  const lastNewline = prefix.lastIndexOf('\n');
  if (lastNewline >= Math.floor(prefix.length * 0.8)) {
    prefix = prefix.slice(0, lastNewline);
  }
  const openFence = findUnclosedCodeFence(prefix);
  const fence = openFence ? `\n${openFence}` : '';
  if (prefix.length + fence.length > prefixBudget) {
    prefix = prefix.slice(0, Math.max(0, prefixBudget - fence.length));
  }
  return `${prefix.trimEnd()}${fence}${reminder}`.slice(0, maxLength);
}

export function formatExcelWorkbookPreview(
  documents: ExcelSheetDocument[],
  maxOutputLength: number = DEFAULT_MAX_OUTPUT_LENGTH,
): string {
  if (documents.length === 0) {
    return '<system-reminder>The workbook does not contain any worksheets.</system-reminder>';
  }

  const workbookSheetCount =
    documents[0]?.metadata.workbookSheetCount ?? documents.length;
  const blocks = [
    [
      `Workbook Worksheets: ${workbookSheetCount}`,
      `Previewed Worksheets: ${documents.length}`,
      `Worksheet Index: ${documents
        .map(
          (sheet, index) =>
            `[${sheet.metadata.workbookSheetIndex ?? index + 1}] ${sheet.id} (${sheet.metadata.effectiveRange})`,
        )
        .join(', ')}`,
    ].join('\n'),
  ];

  blocks.push(
    ...documents.map((sheet) => {
      const lines = [
        `Sheet: ${sheet.id}`,
        `Range: ${sheet.metadata.effectiveRange}`,
        `Declared Range: ${sheet.metadata.declaredRange}`,
      ];
      if (sheet.metadata.requestedRange) {
        lines.push(`Requested Range: ${sheet.metadata.requestedRange}`);
      }
      lines.push(
        `Non-empty Rows: ${sheet.metadata.rowCount}`,
        `Non-empty Columns: ${sheet.metadata.columnCount}`,
      );

      const truncation: string[] = [];
      if (sheet.metadata.omittedRowCount > 0) {
        truncation.push(`${sheet.metadata.omittedRowCount} rows omitted`);
      }
      if (sheet.metadata.omittedColumnCount > 0) {
        truncation.push(`${sheet.metadata.omittedColumnCount} columns omitted`);
      }
      if (sheet.metadata.truncatedCellCount > 0) {
        truncation.push(`${sheet.metadata.truncatedCellCount} cells truncated`);
      }
      if (truncation.length > 0) {
        lines.push(`Preview Limits: ${truncation.join(', ')}`);
      }

      lines.push(
        sheet.pageContent
          ? `Sample Data:\n${wrapMarkdownCodeBlock(sheet.pageContent)}`
          : 'Sample Data: No data',
      );
      return lines.join('\n\n');
    }),
  );

  const omittedSheetCount = documents[0]?.metadata.omittedSheetCount ?? 0;
  if (omittedSheetCount > 0) {
    blocks.push(
      `<system-reminder>${omittedSheetCount} worksheets were omitted from the preview. Call Read again with args: '{"sheetIndex":N}', using a 1-based N between 1 and ${workbookSheetCount}.</system-reminder>`,
    );
  }

  return limitExcelOutput(
    blocks.join('\n\n'),
    normalizeLimit(maxOutputLength, DEFAULT_MAX_OUTPUT_LENGTH),
  );
}

export class ExcelLoader extends BaseLoader {
  options: ExcelLoaderOptions;

  constructor(filePathOrBlob: string | Blob, options?: ExcelLoaderOptions) {
    super(filePathOrBlob);
    this.options = { mode: 'markdown', ...(options ?? {}) };
  }

  async parse(raw: Buffer, metadata: Record<string, any>): Promise<any> {
    if (this.options.sheet && this.options.sheetIndex !== undefined) {
      throw new Error(
        'Provide either an Excel worksheet name or worksheet index, not both.',
      );
    }
    if (
      this.options.sheetIndex !== undefined &&
      (!Number.isSafeInteger(this.options.sheetIndex) ||
        this.options.sheetIndex < 1)
    ) {
      throw new Error('Excel worksheet index must be a positive integer.');
    }
    if (
      this.options.range &&
      !this.options.sheet &&
      this.options.sheetIndex === undefined
    ) {
      throw new Error(
        'Excel range requires a worksheet name or index. Provide args.sheet or args.sheetIndex with args.range.',
      );
    }
    if (this.options.range) decodeUserRange(this.options.range);

    const shouldSelectSheets =
      this.options.sheet !== undefined ||
      this.options.sheetIndex !== undefined ||
      this.options.maxSheet !== undefined;
    let workbook: xlsx.WorkBook;
    let workbookSheetNames: string[];
    let selectedSheetNames: string[];
    let omittedSheetCount = 0;

    if (shouldSelectSheets) {
      const workbookIndex = xlsx.read(raw, {
        type: 'buffer',
        bookSheets: true,
      });
      workbookSheetNames = workbookIndex.SheetNames;
      if (
        this.options.sheet &&
        !workbookSheetNames.includes(this.options.sheet)
      ) {
        throw new Error(
          `Worksheet '${this.options.sheet}' was not found. Available worksheets: ${formatWorksheetNames(workbookSheetNames)}.`,
        );
      }

      if (
        this.options.sheetIndex !== undefined &&
        this.options.sheetIndex > workbookSheetNames.length
      ) {
        throw new Error(
          `Worksheet index ${this.options.sheetIndex} is out of bounds. The workbook contains ${workbookSheetNames.length} worksheets.`,
        );
      }

      const indexedSheetName =
        this.options.sheetIndex === undefined
          ? undefined
          : workbookSheetNames[this.options.sheetIndex - 1];

      let candidateSheetNames = workbookSheetNames;
      if (this.options.sheet) {
        candidateSheetNames = [this.options.sheet];
      } else if (indexedSheetName) {
        candidateSheetNames = [indexedSheetName];
      }
      const maxSheets =
        this.options.maxSheet === undefined
          ? candidateSheetNames.length
          : normalizeLimit(this.options.maxSheet, candidateSheetNames.length);
      selectedSheetNames = candidateSheetNames.slice(0, maxSheets);
      omittedSheetCount = Math.max(
        0,
        candidateSheetNames.length - selectedSheetNames.length,
      );
      workbook = xlsx.read(raw, {
        ...WORKBOOK_READ_OPTIONS,
        sheets: selectedSheetNames,
      });
    } else {
      workbook = xlsx.read(raw, WORKBOOK_READ_OPTIONS);
      workbookSheetNames = workbook.SheetNames;
      selectedSheetNames = workbookSheetNames;
    }

    const workbookSheetCount = workbookSheetNames.length;
    const documents: ExcelSheetDocument[] = [];

    for (const sheetName of selectedSheetNames) {
      const preview = buildWorksheetPreview(workbook.Sheets[sheetName], {
        mode: this.options.mode,
        maxRow: this.options.maxRow,
        maxColumn: this.options.maxColumn,
        maxCellLength: this.options.maxCellLength,
        range: this.options.range,
      });
      documents.push({
        id: sheetName,
        pageContent: preview.pageContent,
        metadata: {
          ...preview.metadata,
          workbookSheetCount,
          workbookSheetIndex: workbookSheetNames.indexOf(sheetName) + 1,
          omittedSheetCount,
        },
      });
    }

    metadata.source =
      typeof this.filePathOrBlob === 'string'
        ? this.filePathOrBlob
        : metadata.source;
    return documents;
  }

  // BaseLoader requires this instance method even though Excel has no separate info pass.
  // eslint-disable-next-line class-methods-use-this
  async getInfo(
    _buffer: Buffer,
    _metadata: Record<string, any>,
  ): Promise<undefined> {
    return undefined;
  }
}
