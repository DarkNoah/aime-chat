import * as xlsx from 'xlsx';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildWorksheetPreview,
  ExcelLoader,
  formatExcelWorkbookPreview,
} from '../excel-loader';

const MAX_EXCEL_TEST_ROW = 1_048_575;
const MAX_EXCEL_TEST_COLUMN = 16_383;

function stringCell(value: string): xlsx.CellObject {
  return { t: 's', v: value };
}

describe('buildWorksheetPreview', () => {
  it('ignores a polluted declared range and only renders populated cells', () => {
    const worksheet: xlsx.WorkSheet = {
      A1: stringCell('Name'),
      A2: stringCell('Alice'),
      '!ref': 'A1:XFD1048576',
    };

    const preview = buildWorksheetPreview(worksheet);

    expect(preview.metadata.declaredRange).toBe('A1:XFD1048576');
    expect(preview.metadata.effectiveRange).toBe('A1:A2');
    expect(preview.metadata.rowCount).toBe(2);
    expect(preview.metadata.columnCount).toBe(1);
    expect(preview.pageContent).toContain('| Excel row | A |');
    expect(preview.pageContent).toContain('| 2 | Alice |');
    expect(preview.pageContent).not.toContain('Column16384');
    expect(preview.pageContent.length).toBeLessThan(500);
  });

  it('keeps zero, false, and formula-only cells while ignoring empty stubs', () => {
    const worksheet: xlsx.WorkSheet = {
      A1: { t: 'n', v: 0 },
      B1: { t: 'b', v: false },
      C10: { t: 'z' },
      D10: { t: 'z', f: 'IF(A1="","",A1)' },
      '!ref': 'A1:D10',
    };

    const preview = buildWorksheetPreview(worksheet);

    expect(preview.metadata.rowCount).toBe(2);
    expect(preview.metadata.columnCount).toBe(3);
    expect(preview.pageContent).toContain('| 1 | 0 | FALSE |');
    expect(preview.pageContent).toContain('=IF(A1="","",A1)');
    expect(preview.pageContent).not.toContain('| C |');
  });

  it('does not materialize empty rows or columns between distant cells', () => {
    const worksheet: xlsx.WorkSheet = {
      A1: stringCell('start'),
      XFD1048576: stringCell('tail'),
      '!ref': 'A1:XFD1048576',
    };

    const preview = buildWorksheetPreview(worksheet);

    expect(preview.metadata.effectiveRange).toBe('A1:XFD1048576');
    expect(preview.metadata.rowCount).toBe(2);
    expect(preview.metadata.columnCount).toBe(2);
    expect(preview.pageContent).toContain('| Excel row | A | XFD |');
    expect(preview.pageContent).toContain('| 1048576 |  | tail |');
    expect(preview.pageContent.length).toBeLessThan(1_000);
  });

  it('only visits populated indexes in a dense worksheet', () => {
    const denseWorksheet: any[] = [];
    denseWorksheet[0] = [];
    denseWorksheet[0][0] = stringCell('start');
    denseWorksheet[MAX_EXCEL_TEST_ROW] = [];
    denseWorksheet[MAX_EXCEL_TEST_ROW][MAX_EXCEL_TEST_COLUMN] =
      stringCell('tail');
    denseWorksheet['!ref' as any] = 'A1:XFD1048576';

    const preview = buildWorksheetPreview(denseWorksheet as any);

    expect(preview.metadata.rowCount).toBe(2);
    expect(preview.metadata.columnCount).toBe(2);
    expect(preview.pageContent).toContain('start');
    expect(preview.pageContent).toContain('tail');
    expect(preview.pageContent.length).toBeLessThan(1_000);
  });

  it('samples the head and tail of populated rows and columns', () => {
    const worksheet: xlsx.WorkSheet = { '!ref': 'A1:J20' };
    for (let row = 0; row < 20; row += 1) {
      worksheet[xlsx.utils.encode_cell({ r: row, c: 0 })] = stringCell(
        `row-${row + 1}`,
      );
    }
    for (let column = 0; column < 10; column += 1) {
      worksheet[xlsx.utils.encode_cell({ r: 0, c: column })] = stringCell(
        `column-${column + 1}`,
      );
    }

    const preview = buildWorksheetPreview(worksheet, {
      maxRow: 4,
      maxColumn: 4,
    });

    expect(preview.metadata.omittedRowCount).toBe(16);
    expect(preview.metadata.omittedColumnCount).toBe(6);
    expect(preview.pageContent).toContain('… 16 rows omitted …');
    expect(preview.pageContent).toContain('… 6 columns omitted …');
    expect(preview.pageContent).toContain('| 1 |');
    expect(preview.pageContent).toContain('| 20 |');
    expect(preview.pageContent).toContain('A');
    expect(preview.pageContent).toContain('J');
  });

  it('keeps representative cells when independently sampled axes do not intersect', () => {
    const worksheet: xlsx.WorkSheet = {
      M1: stringCell('row-1'),
      N2: stringCell('row-2'),
      A3: stringCell('row-3'),
      B4: stringCell('row-4'),
      O17: stringCell('row-17'),
      P18: stringCell('row-18'),
      M19: stringCell('row-19'),
      N20: stringCell('row-20'),
      '!ref': 'A1:P20',
    };

    const preview = buildWorksheetPreview(worksheet, {
      maxRow: 4,
      maxColumn: 4,
    });

    expect(preview.pageContent).toContain('row-1');
    expect(preview.pageContent).toContain('row-2');
    expect(preview.pageContent).toContain('row-19');
    expect(preview.pageContent).toContain('row-20');
    expect(preview.pageContent).not.toMatch(/\| 1 \|\s*\|/);
    expect(preview.metadata.omittedRowCount).toBe(4);
    expect(preview.metadata.omittedColumnCount).toBe(4);
  });

  it('truncates individual cells before rendering markdown', () => {
    const worksheet: xlsx.WorkSheet = {
      A1: stringCell('x'.repeat(200)),
      B1: stringCell('neighbor'),
      '!ref': 'A1:B1',
    };

    const preview = buildWorksheetPreview(worksheet, {
      maxCellLength: 30,
    });

    expect(preview.metadata.truncatedCellCount).toBe(1);
    expect(preview.pageContent).toContain('[cell truncated]');
    expect(preview.pageContent).toContain('neighbor');
    expect(preview.pageContent).not.toContain('x'.repeat(31));
  });

  it('escapes cell delimiters and line breaks without breaking the table', () => {
    const worksheet: xlsx.WorkSheet = {
      A1: stringCell('left|right'),
      B1: stringCell('path\\name\nnext'),
      '!ref': 'A1:B1',
    };

    const preview = buildWorksheetPreview(worksheet);

    expect(preview.pageContent).toContain('left\\|right');
    expect(preview.pageContent).toContain('path\\\\name<br>next');
  });

  it('filters cells using a validated A1 range', () => {
    const worksheet: xlsx.WorkSheet = {
      A1: stringCell('outside'),
      B2: stringCell('inside-start'),
      C3: stringCell('inside-end'),
      '!ref': 'A1:C3',
    };

    const preview = buildWorksheetPreview(worksheet, {
      range: 'b2:C3',
    });

    expect(preview.metadata.requestedRange).toBe('B2:C3');
    expect(preview.metadata.effectiveRange).toBe('B2:C3');
    expect(preview.pageContent).toContain('inside-start');
    expect(preview.pageContent).toContain('inside-end');
    expect(preview.pageContent).not.toContain('outside');
  });

  it.each(['A0', 'XFE1', 'A2:A1', 'not-a-range'])(
    'rejects invalid or out-of-bounds range %s',
    (range) => {
      expect(() =>
        buildWorksheetPreview(
          { A1: stringCell('value'), '!ref': 'A1' },
          { range },
        ),
      ).toThrow(/Excel (cell reference|range)/);
    },
  );
});

describe('formatExcelWorkbookPreview', () => {
  it('enforces a strict workbook output limit with a continuation hint', () => {
    const preview = buildWorksheetPreview(
      {
        A1: stringCell('x'.repeat(2_000)),
        '!ref': 'A1',
      },
      { maxCellLength: 2_000 },
    );

    const output = formatExcelWorkbookPreview(
      [
        {
          id: 'Data',
          ...preview,
        },
      ],
      400,
    );

    expect(output.length).toBeLessThanOrEqual(400);
    expect(output).toContain('Excel preview exceeded the total output limit');
    expect(output).toContain('args');
    expect(output).toContain('sheetIndex');
    expect(output).toContain('range');
  });

  it('reports worksheets omitted by the workbook preview limit', () => {
    const preview = buildWorksheetPreview({
      A1: stringCell('value'),
      '!ref': 'A1',
    });
    preview.metadata.omittedSheetCount = 2;

    const output = formatExcelWorkbookPreview([{ id: 'Visible', ...preview }]);

    expect(output).toContain('2 worksheets were omitted');
    expect(output).toContain('args');
    expect(output).toContain('sheetIndex');
  });

  it('keeps a workbook index visible when the first worksheet exhausts the budget', () => {
    const large = buildWorksheetPreview(
      { A1: stringCell('x'.repeat(2_000)), '!ref': 'A1' },
      { maxCellLength: 2_000 },
    );
    const later = buildWorksheetPreview({
      A1: stringCell('important'),
      '!ref': 'A1',
    });

    const output = formatExcelWorkbookPreview(
      [
        { id: 'Large', ...large },
        { id: 'Later', ...later },
      ],
      500,
    );

    expect(output).toContain('Worksheet Index: [1] Large (A1), [2] Later (A1)');
    expect(output.length).toBeLessThanOrEqual(500);
  });

  it('uses a longer code fence when worksheet content contains backticks', () => {
    const preview = buildWorksheetPreview({
      A1: stringCell('```close-fence'),
      '!ref': 'A1',
    });

    const output = formatExcelWorkbookPreview([
      { id: 'Untrusted content', ...preview },
    ]);

    expect(output).toContain('````markdown');
    expect(output).toContain('```close-fence');
    expect(output).toContain('\n````');
  });
});

describe('ExcelLoader', () => {
  function createWorkbookBuffer(bookType: xlsx.BookType = 'xlsx'): Buffer {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.aoa_to_sheet([['first'], ['sheet']]),
      'First',
    );
    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.aoa_to_sheet([
        ['Name', 'Value'],
        ['selected', 42],
        ['outside', 99],
      ]),
      'Second',
    );
    return xlsx.write(workbook, { type: 'buffer', bookType });
  }

  it('reads the requested worksheet and range from the existing buffer', async () => {
    const loader = new ExcelLoader('ignored.xlsx', {
      sheet: 'Second',
      range: 'A1:B2',
    });

    const documents = await loader.parse(createWorkbookBuffer(), {});

    expect(documents).toHaveLength(1);
    expect(documents[0].id).toBe('Second');
    expect(documents[0].metadata.requestedRange).toBe('A1:B2');
    expect(documents[0].pageContent).toContain('selected');
    expect(documents[0].pageContent).not.toContain('outside');
  });

  it('requires a worksheet when a range is provided', async () => {
    const loader = new ExcelLoader('ignored.xlsx', { range: 'A1:B2' });

    await expect(loader.parse(createWorkbookBuffer(), {})).rejects.toThrow(
      'Excel range requires a worksheet name or index',
    );
  });

  it('reads a worksheet by its 1-based index', async () => {
    const loader = new ExcelLoader('ignored.xlsx', {
      sheetIndex: 2,
      range: 'A1:B2',
    });

    const documents = await loader.parse(createWorkbookBuffer(), {});

    expect(documents).toHaveLength(1);
    expect(documents[0].id).toBe('Second');
    expect(documents[0].metadata.workbookSheetIndex).toBe(2);
    expect(documents[0].pageContent).toContain('selected');
  });

  it('rejects an out-of-bounds worksheet index', async () => {
    const loader = new ExcelLoader('ignored.xlsx', { sheetIndex: 3 });

    await expect(loader.parse(createWorkbookBuffer(), {})).rejects.toThrow(
      'Worksheet index 3 is out of bounds',
    );
  });

  it('rejects a worksheet name and index used together', async () => {
    const loader = new ExcelLoader('ignored.xlsx', {
      sheet: 'Second',
      sheetIndex: 2,
    });

    await expect(loader.parse(createWorkbookBuffer(), {})).rejects.toThrow(
      'not both',
    );
  });

  it('reports available worksheets when the requested name is missing', async () => {
    const loader = new ExcelLoader('ignored.xlsx', { sheet: 'Missing' });

    await expect(loader.parse(createWorkbookBuffer(), {})).rejects.toThrow(
      'Available worksheets: First, Second',
    );
  });

  it.each(['toString', 'constructor', '__proto__'])(
    'does not accept inherited property name %s as a worksheet',
    async (sheet) => {
      const loader = new ExcelLoader('ignored.xlsx', { sheet });

      await expect(loader.parse(createWorkbookBuffer(), {})).rejects.toThrow(
        `Worksheet '${sheet}' was not found`,
      );
    },
  );

  it('limits parsed worksheets and reports how many were omitted', async () => {
    const loader = new ExcelLoader('ignored.xlsx', { maxSheet: 1 });

    const documents = await loader.parse(createWorkbookBuffer(), {});

    expect(documents).toHaveLength(1);
    expect(documents[0].id).toBe('First');
    expect(documents[0].metadata.workbookSheetCount).toBe(2);
    expect(documents[0].metadata.omittedSheetCount).toBe(1);
  });

  it('loads a workbook through the shared BaseLoader buffer path', async () => {
    const temporaryDirectory = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'aime-excel-loader-'),
    );
    const workbookPath = path.join(temporaryDirectory, 'workbook.xlsx');
    try {
      await fs.promises.writeFile(workbookPath, createWorkbookBuffer());
      const loader = new ExcelLoader(workbookPath, { sheet: 'Second' });

      const documents = await loader.load();

      expect(documents).toHaveLength(1);
      expect(documents[0].pageContent).toContain('selected');
    } finally {
      await fs.promises.rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
  });

  it.each<xlsx.BookType>(['xlsx', 'xls'])(
    'parses %s workbooks from the shared loader buffer',
    async (bookType) => {
      const loader = new ExcelLoader(`ignored.${bookType}`);

      const documents = await loader.parse(createWorkbookBuffer(bookType), {});

      expect(documents).toHaveLength(2);
      expect(documents[1].pageContent).toContain('selected');
    },
  );
});
