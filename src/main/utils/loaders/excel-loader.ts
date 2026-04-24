import { BaseLoader } from './base-loader';
import * as xlsx from 'xlsx';
import fs from 'fs';

export type ExcelMode = 'text' | 'markdown';

export type ExcelLoaderOptions = {
  maxRow?: number;
  mode: ExcelMode;
};

const MIN_MAX_ROW = 15;
const TRUNCATE_HEAD = 5;
const TRUNCATE_TAIL = 5;
const TRUNCATE_PLACEHOLDER = '...[the data is too large]...';

export class ExcelLoader extends BaseLoader {
  options: ExcelLoaderOptions;
  constructor(filePathOrBlob: string | Blob, options?: ExcelLoaderOptions) {
    super(filePathOrBlob);
    this.options = { maxRow: MIN_MAX_ROW, mode: 'markdown', ...(options ?? {}) };
  }

  async parse(raw: Buffer, metadata: Record<string, any>): Promise<any> {
    let wb: xlsx.WorkBook;
    xlsx.set_fs(fs);
    if (this.filePathOrBlob instanceof Blob) {
      const arrayBuffer = await this.filePathOrBlob.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      wb = xlsx.read(data, { type: 'array' });
    } else {
      wb = xlsx.readFile(this.filePathOrBlob);
      metadata['source'] = this.filePathOrBlob;
    }

    // maxRow 下限兜底，避免截断时头尾相加超过展示行数
    const maxRow = Math.max(this.options.maxRow ?? MIN_MAX_ROW, MIN_MAX_ROW);

    const docs: {
      id: string;
      pageContent: string;
      metadata: Record<string, any>;
    }[] = [];

    for (const sheetName of wb.SheetNames) {
      const worksheet = wb.Sheets[sheetName];
      const worksheetMetadata: Record<string, any> = {};

      let row = worksheet['!rows']?.length;
      if (row === undefined) {
        const result = worksheet['!ref']?.split(':')[1]?.match(/\d+$/)?.[0] || '';
        if (result) {
          worksheetMetadata['range'] = worksheet['!ref'];
          row = parseInt(result, 10);
        } else {
          worksheetMetadata['range'] = 'NULL';
          row = 0;
        }
      } else {
        worksheetMetadata['range'] = worksheet['!ref'] ?? 'NULL';
      }
      worksheetMetadata['rowCount'] = row;

      // 以二维数组读取，保留单元格原值（含换行符），便于后续按 mode 做安全转义
      const aoa = xlsx.utils.sheet_to_json<any[]>(worksheet, {
        header: 1,
        blankrows: false,
        defval: '',
        raw: false,
      });

      const pageContent =
        this.options.mode === 'markdown'
          ? this.toMarkdown(aoa, maxRow)
          : this.toText(aoa, maxRow);

      docs.push({ id: sheetName, pageContent, metadata: worksheetMetadata });
    }
    return docs;
  }

  getInfo(buffer: Buffer, metadata: Record<string, any>): Promise<any> {
    return undefined;
  }

  /**
   * 统一的单元格转义。核心是处理单元格内部的换行符，避免破坏行结构/表格结构。
   * - text 模式：换行转成字面量 \n，制表符转成空格，保证“一行一条记录”
   * - markdown 模式：换行转成 <br>，并转义 `|` 和反斜杠，保证表格列对齐
   */
  private escapeCell(value: any, mode: ExcelMode): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (mode === 'markdown') {
      return str
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/\r\n|\n|\r/g, '<br>');
    }
    return str.replace(/\r\n|\n|\r/g, '\\n').replace(/\t/g, ' ');
  }

  private toText(aoa: any[][], maxRow: number): string {
    const rows = aoa.map((row) =>
      row.map((cell) => this.escapeCell(cell, 'text')).join('\t'),
    );
    if (rows.length <= maxRow) {
      return rows.join('\n');
    }
    const head = rows.slice(0, TRUNCATE_HEAD).join('\n');
    const tail = rows.slice(-TRUNCATE_TAIL).join('\n');
    return `${head}\n\n${TRUNCATE_PLACEHOLDER}\n\n${tail}`;
  }

  private toMarkdown(aoa: any[][], maxRow: number): string {
    if (aoa.length === 0) return '';

    const colCount = aoa.reduce((m, r) => Math.max(m, r.length), 0);
    if (colCount === 0) return '';

    const headerSource = aoa[0] ?? [];
    const headerCells: string[] = [];
    for (let i = 0; i < colCount; i++) {
      const v = headerSource[i];
      const cell =
        v === undefined || v === null || v === ''
          ? `Column${i + 1}`
          : v;
      headerCells.push(this.escapeCell(cell, 'markdown'));
    }
    const separator = `| ${Array(colCount).fill('---').join(' | ')} |`;

    const buildRow = (row: any[] = []): string => {
      const cells: string[] = [];
      for (let i = 0; i < colCount; i++) {
        cells.push(this.escapeCell(row[i] ?? '', 'markdown'));
      }
      return `| ${cells.join(' | ')} |`;
    };

    const dataRows = aoa.slice(1);
    const lines: string[] = [];
    lines.push(`| ${headerCells.join(' | ')} |`);
    lines.push(separator);

    if (aoa.length <= maxRow) {
      for (const r of dataRows) lines.push(buildRow(r));
      return lines.join('\n');
    }

    // 表格截断：保留表头，头尾各展示若干数据行，中间用占位符分隔成两张合法的 md 表
    const headData = dataRows.slice(0, TRUNCATE_HEAD - 1);
    const tailData = dataRows.slice(-TRUNCATE_TAIL);
    for (const r of headData) lines.push(buildRow(r));
    lines.push('');
    lines.push(TRUNCATE_PLACEHOLDER);
    lines.push('');
    // lines.push(`| ${headerCells.join(' | ')} |`);
    // lines.push(separator);
    for (const r of tailData) lines.push(buildRow(r));
    return lines.join('\n');
  }
}
