import MarkdownIt from 'markdown-it';

export type MarkdownTableMode = 'off' | 'bullets' | 'code';
export type ChunkMode = 'length' | 'newline';

export type MarkdownStyle =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code'
  | 'code_block'
  | 'spoiler'
  | 'blockquote';

export type MarkdownStyleSpan = {
  start: number;
  end: number;
  style: MarkdownStyle;
};

export type MarkdownLinkSpan = {
  start: number;
  end: number;
  href: string;
};

export type MarkdownIR = {
  text: string;
  styles: MarkdownStyleSpan[];
  links: MarkdownLinkSpan[];
};

type MarkdownToken = {
  type: string;
  content?: string;
  children?: MarkdownToken[];
  attrs?: [string, string][];
  attrGet?: (name: string) => string | null;
};

type RenderTarget = {
  text: string;
  styles: MarkdownStyleSpan[];
  openStyles: { style: MarkdownStyle; start: number }[];
  links: MarkdownLinkSpan[];
  linkStack: { href: string; labelStart: number }[];
};

type TableCell = { text: string; styles: MarkdownStyleSpan[]; links: MarkdownLinkSpan[] };

type TableState = {
  headers: TableCell[];
  rows: TableCell[][];
  currentRow: TableCell[];
  currentCell: RenderTarget | null;
  inHeader: boolean;
};

type RenderState = RenderTarget & {
  listStack: Array<{ type: 'bullet' | 'ordered'; index: number }>;
  headingStyle: 'none' | 'bold';
  enableSpoilers: boolean;
  tableMode: MarkdownTableMode;
  table: TableState | null;
};

export type MarkdownParseOptions = {
  linkify?: boolean;
  enableSpoilers?: boolean;
  headingStyle?: 'none' | 'bold';
  blockquotePrefix?: string;
  autolink?: boolean;
  tableMode?: MarkdownTableMode;
};

type FenceSpan = {
  start: number;
  end: number;
  marker: string;
  indent: string;
  openLine: string;
};

type TelegramFormattedChunk = { html: string; text: string };
type RenderLink = { start: number; end: number; open: string; close: string };

const FILE_EXTENSIONS_WITH_TLD = new Set(['md', 'go', 'py', 'pl', 'sh', 'am', 'at', 'be', 'cc']);
const FILE_EXTENSIONS_PATTERN = Array.from(FILE_EXTENSIONS_WITH_TLD)
  .map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
const AUTO_LINKED_ANCHOR_PATTERN = /<a\s+href="https?:\/\/([^"]+)"[^>]*>\1<\/a>/gi;
const FILE_REFERENCE_PATTERN = new RegExp(
  `(^|[^a-zA-Z0-9_\\-/])([a-zA-Z0-9_.\\-./]+\\.(?:${FILE_EXTENSIONS_PATTERN}))(?=$|[^a-zA-Z0-9_\\-/])`,
  'gi',
);
const ORPHANED_TLD_PATTERN = new RegExp(
  `([^a-zA-Z0-9]|^)([A-Za-z]\\.(?:${FILE_EXTENSIONS_PATTERN}))(?=[^a-zA-Z0-9/]|$)`,
  'g',
);
const HTML_TAG_PATTERN = /(<\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?>/gi;
const STYLE_ORDER: MarkdownStyle[] = [
  'blockquote',
  'code_block',
  'code',
  'bold',
  'italic',
  'strikethrough',
  'spoiler',
];
const STYLE_RANK = new Map(STYLE_ORDER.map((style, index) => [style, index]));

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

function initRenderTarget(): RenderTarget {
  return { text: '', styles: [], openStyles: [], links: [], linkStack: [] };
}

function createMarkdownIt(options: MarkdownParseOptions): MarkdownIt {
  const md = new MarkdownIt({ html: false, linkify: options.linkify ?? true, breaks: false, typographer: false });
  md.enable('strikethrough');
  if (options.tableMode && options.tableMode !== 'off') md.enable('table');
  else md.disable('table');
  if (options.autolink === false) md.disable('autolink');
  return md;
}

function getAttr(token: MarkdownToken, name: string): string | null {
  if (token.attrGet) return token.attrGet(name);
  return token.attrs?.find(([key]) => key === name)?.[1] ?? null;
}

function injectSpoilers(tokens: MarkdownToken[]): MarkdownToken[] {
  let total = 0;
  for (const token of tokens) {
    if (token.type !== 'text') continue;
    total += (token.content?.match(/\|\|/g) ?? []).length;
  }
  if (total < 2) return tokens;
  const usable = total - (total % 2);
  let consumed = 0;
  let open = false;
  const out: MarkdownToken[] = [];
  for (const token of tokens) {
    if (token.type !== 'text') {
      out.push(token);
      continue;
    }
    const content = token.content ?? '';
    let index = 0;
    while (index < content.length) {
      const next = content.indexOf('||', index);
      if (next === -1 || consumed >= usable) {
        if (index < content.length) out.push({ ...token, type: 'text', content: content.slice(index), children: undefined });
        break;
      }
      if (next > index) out.push({ ...token, type: 'text', content: content.slice(index, next), children: undefined });
      open = !open;
      consumed += 1;
      out.push({ type: open ? 'spoiler_open' : 'spoiler_close' });
      index = next + 2;
    }
  }
  return out;
}

function applySpoilers(tokens: MarkdownToken[]): void {
  for (const token of tokens) {
    if (token.children?.length) token.children = injectSpoilers(token.children);
  }
}

function resolveTarget(state: RenderState): RenderTarget {
  return state.table?.currentCell ?? state;
}

function appendText(state: RenderState, value: string): void {
  if (!value) return;
  resolveTarget(state).text += value;
}

function openStyle(state: RenderState, style: MarkdownStyle): void {
  resolveTarget(state).openStyles.push({ style, start: resolveTarget(state).text.length });
}

function closeStyle(target: RenderTarget, style: MarkdownStyle): void {
  for (let i = target.openStyles.length - 1; i >= 0; i -= 1) {
    const open = target.openStyles[i];
    if (open.style !== style) continue;
    target.openStyles.splice(i, 1);
    const end = target.text.length;
    if (end > open.start) target.styles.push({ start: open.start, end, style });
    return;
  }
}

function closeRemainingStyles(target: RenderTarget): void {
  for (let i = target.openStyles.length - 1; i >= 0; i -= 1) {
    const open = target.openStyles[i];
    if (target.text.length > open.start) {
      target.styles.push({ start: open.start, end: target.text.length, style: open.style });
    }
  }
  target.openStyles = [];
}

function appendCell(state: RenderState, cell: TableCell, textOnly = false): void {
  if (!cell.text) return;
  const start = state.text.length;
  state.text += cell.text;
  if (textOnly) return;
  for (const span of cell.styles) state.styles.push({ start: start + span.start, end: start + span.end, style: span.style });
  for (const link of cell.links) state.links.push({ start: start + link.start, end: start + link.end, href: link.href });
}

function trimCell(cell: TableCell): TableCell {
  const trimmed = cell.text.trim();
  if (trimmed === cell.text) return cell;
  const start = cell.text.indexOf(trimmed);
  return {
    text: trimmed,
    styles: cell.styles
      .map((span) => ({ start: Math.max(0, span.start - start), end: Math.min(trimmed.length, span.end - start), style: span.style }))
      .filter((span) => span.end > span.start),
    links: cell.links
      .map((link) => ({ start: Math.max(0, link.start - start), end: Math.min(trimmed.length, link.end - start), href: link.href }))
      .filter((link) => link.end > link.start),
  };
}

function renderTable(state: RenderState): void {
  if (!state.table) return;
  const headers = state.table.headers.map(trimCell);
  const rows = state.table.rows.map((row) => row.map(trimCell));
  if (state.tableMode === 'bullets') {
    const useFirstColAsLabel = headers.length > 1 && rows.length > 0;
    for (const row of rows) {
      if (useFirstColAsLabel && row[0]?.text) {
        const start = state.text.length;
        appendCell(state, row[0]);
        if (state.text.length > start) state.styles.push({ start, end: state.text.length, style: 'bold' });
        state.text += '\n';
      }
      for (let i = useFirstColAsLabel ? 1 : 0; i < row.length; i += 1) {
        const value = row[i];
        if (!value?.text) continue;
        state.text += '• ';
        if (headers[i]?.text) {
          appendCell(state, headers[i]);
          state.text += ': ';
        }
        appendCell(state, value);
        state.text += '\n';
      }
      state.text += '\n';
    }
    return;
  }
  if (state.tableMode === 'code') {
    const colCount = Math.max(headers.length, ...rows.map((row) => row.length), 0);
    if (!colCount) return;
    const widths = Array.from({ length: colCount }, () => 0);
    const updateWidths = (cells: TableCell[]) => {
      for (let i = 0; i < colCount; i += 1) widths[i] = Math.max(widths[i], cells[i]?.text.length ?? 0);
    };
    updateWidths(headers);
    rows.forEach(updateWidths);
    const codeStart = state.text.length;
    const appendRow = (cells: TableCell[]) => {
      state.text += '|';
      for (let i = 0; i < colCount; i += 1) {
        state.text += ' ';
        if (cells[i]) appendCell(state, cells[i], true);
        state.text += ' '.repeat(widths[i] - (cells[i]?.text.length ?? 0));
        state.text += ' |';
      }
      state.text += '\n';
    };
    appendRow(headers);
    state.text += '|';
    for (let i = 0; i < colCount; i += 1) state.text += ` ${'-'.repeat(Math.max(3, widths[i]))} |`;
    state.text += '\n';
    rows.forEach(appendRow);
    state.styles.push({ start: codeStart, end: state.text.length, style: 'code_block' });
    state.text += '\n';
  }
}

function renderTokens(tokens: MarkdownToken[], state: RenderState): void {
  for (const token of tokens) {
    const target = resolveTarget(state);
    switch (token.type) {
      case 'inline':
        if (token.children) renderTokens(token.children, state);
        break;
      case 'text':
        appendText(state, token.content ?? '');
        break;
      case 'em_open':
        openStyle(state, 'italic');
        break;
      case 'em_close':
        closeStyle(target, 'italic');
        break;
      case 'strong_open':
        openStyle(state, 'bold');
        break;
      case 'strong_close':
        closeStyle(target, 'bold');
        break;
      case 's_open':
        openStyle(state, 'strikethrough');
        break;
      case 's_close':
        closeStyle(target, 'strikethrough');
        break;
      case 'code_inline': {
        const start = target.text.length;
        target.text += token.content ?? '';
        target.styles.push({ start, end: target.text.length, style: 'code' });
        break;
      }
      case 'spoiler_open':
        if (state.enableSpoilers) openStyle(state, 'spoiler');
        break;
      case 'spoiler_close':
        if (state.enableSpoilers) closeStyle(target, 'spoiler');
        break;
      case 'link_open':
        target.linkStack.push({ href: getAttr(token, 'href') ?? '', labelStart: target.text.length });
        break;
      case 'link_close': {
        const link = target.linkStack.pop();
        if (link?.href.trim()) target.links.push({ start: link.labelStart, end: target.text.length, href: link.href.trim() });
        break;
      }
      case 'softbreak':
      case 'hardbreak':
        appendText(state, '\n');
        break;
      case 'paragraph_close':
        if (!state.listStack.length && !state.table) state.text += '\n\n';
        break;
      case 'heading_open':
        if (state.headingStyle === 'bold') openStyle(state, 'bold');
        break;
      case 'heading_close':
        if (state.headingStyle === 'bold') closeStyle(target, 'bold');
        state.text += '\n\n';
        break;
      case 'blockquote_open':
        openStyle(state, 'blockquote');
        break;
      case 'blockquote_close':
        closeStyle(target, 'blockquote');
        break;
      case 'bullet_list_open':
        if (state.listStack.length) state.text += '\n';
        state.listStack.push({ type: 'bullet', index: 0 });
        break;
      case 'ordered_list_open':
        if (state.listStack.length) state.text += '\n';
        state.listStack.push({ type: 'ordered', index: Number(getAttr(token, 'start') ?? '1') - 1 });
        break;
      case 'bullet_list_close':
      case 'ordered_list_close':
        state.listStack.pop();
        if (!state.listStack.length) state.text += '\n';
        break;
      case 'list_item_open': {
        const top = state.listStack[state.listStack.length - 1];
        if (!top) break;
        top.index += 1;
        state.text += `${'  '.repeat(Math.max(0, state.listStack.length - 1))}${top.type === 'ordered' ? `${top.index}. ` : '• '}`;
        break;
      }
      case 'list_item_close':
        if (!state.text.endsWith('\n')) state.text += '\n';
        break;
      case 'code_block':
      case 'fence': {
        const start = target.text.length;
        const code = (token.content ?? '').endsWith('\n') ? token.content ?? '' : `${token.content ?? ''}\n`;
        target.text += code;
        target.styles.push({ start, end: target.text.length, style: 'code_block' });
        if (!state.listStack.length) target.text += '\n';
        break;
      }
      case 'table_open':
        if (state.tableMode !== 'off') state.table = { headers: [], rows: [], currentRow: [], currentCell: null, inHeader: false };
        break;
      case 'table_close':
        renderTable(state);
        state.table = null;
        break;
      case 'thead_open':
        if (state.table) state.table.inHeader = true;
        break;
      case 'thead_close':
        if (state.table) state.table.inHeader = false;
        break;
      case 'tr_open':
        if (state.table) state.table.currentRow = [];
        break;
      case 'tr_close':
        if (state.table) {
          if (state.table.inHeader) state.table.headers = state.table.currentRow;
          else state.table.rows.push(state.table.currentRow);
          state.table.currentRow = [];
        }
        break;
      case 'th_open':
      case 'td_open':
        if (state.table) state.table.currentCell = initRenderTarget();
        break;
      case 'th_close':
      case 'td_close':
        if (state.table?.currentCell) {
          closeRemainingStyles(state.table.currentCell);
          state.table.currentRow.push({ text: state.table.currentCell.text, styles: state.table.currentCell.styles, links: state.table.currentCell.links });
          state.table.currentCell = null;
        }
        break;
      case 'hr':
        state.text += '───\n\n';
        break;
      default:
        if (token.children) renderTokens(token.children, state);
        break;
    }
  }
}

function mergeStyleSpans(spans: MarkdownStyleSpan[]): MarkdownStyleSpan[] {
  const sorted = [...spans].sort((a, b) => (a.start - b.start) || (a.end - b.end) || a.style.localeCompare(b.style));
  const merged: MarkdownStyleSpan[] = [];
  for (const span of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && prev.style === span.style && (span.start < prev.end || (span.start === prev.end && span.style !== 'blockquote'))) {
      prev.end = Math.max(prev.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

function clampStyles(spans: MarkdownStyleSpan[], maxLength: number): MarkdownStyleSpan[] {
  return spans
    .map((span) => ({ start: Math.max(0, Math.min(span.start, maxLength)), end: Math.max(0, Math.min(span.end, maxLength)), style: span.style }))
    .filter((span) => span.end > span.start);
}

function clampLinks(spans: MarkdownLinkSpan[], maxLength: number): MarkdownLinkSpan[] {
  return spans
    .map((span) => ({ start: Math.max(0, Math.min(span.start, maxLength)), end: Math.max(0, Math.min(span.end, maxLength)), href: span.href }))
    .filter((span) => span.end > span.start);
}

function sliceStyleSpans(spans: MarkdownStyleSpan[], start: number, end: number): MarkdownStyleSpan[] {
  return mergeStyleSpans(
    spans
      .map((span) => ({ start: Math.max(span.start, start) - start, end: Math.min(span.end, end) - start, style: span.style }))
      .filter((span) => span.end > span.start),
  );
}

function sliceLinkSpans(spans: MarkdownLinkSpan[], start: number, end: number): MarkdownLinkSpan[] {
  return spans
    .map((span) => ({ start: Math.max(span.start, start) - start, end: Math.min(span.end, end) - start, href: span.href }))
    .filter((span) => span.end > span.start);
}

export function markdownToIR(markdown: string, options: MarkdownParseOptions = {}): MarkdownIR {
  const md = createMarkdownIt(options);
  const tokens = md.parse(markdown ?? '', {}) as MarkdownToken[];
  if (options.enableSpoilers) applySpoilers(tokens);
  const state: RenderState = {
    ...initRenderTarget(),
    listStack: [],
    headingStyle: options.headingStyle ?? 'none',
    enableSpoilers: options.enableSpoilers ?? false,
    tableMode: options.tableMode ?? 'off',
    table: null,
  };
  renderTokens(tokens, state);
  closeRemainingStyles(state);
  const trimmedText = state.text.trimEnd();
  const codeBlockEnd = state.styles.filter((x) => x.style === 'code_block').reduce((max, x) => Math.max(max, x.end), 0);
  const finalLength = Math.max(trimmedText.length, codeBlockEnd);
  return {
    text: state.text.slice(0, finalLength),
    styles: mergeStyleSpans(clampStyles(state.styles, finalLength)),
    links: clampLinks(state.links, finalLength),
  };
}

function sortStyleSpans(spans: MarkdownStyleSpan[]): MarkdownStyleSpan[] {
  return [...spans].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return b.end - a.end;
    return (STYLE_RANK.get(a.style) ?? 0) - (STYLE_RANK.get(b.style) ?? 0);
  });
}

function isAutoLinkedFileRef(href: string, label: string): boolean {
  const stripped = href.replace(/^https?:\/\//i, '');
  if (stripped !== label) return false;
  const dotIndex = label.lastIndexOf('.');
  if (dotIndex < 1) return false;
  const ext = label.slice(dotIndex + 1).toLowerCase();
  if (!FILE_EXTENSIONS_WITH_TLD.has(ext)) return false;
  const segments = label.split('/');
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (segments[i].includes('.')) return false;
  }
  return true;
}

function buildTelegramLink(link: MarkdownLinkSpan, text: string): RenderLink | null {
  const href = link.href.trim();
  if (!href || link.start === link.end) return null;
  const label = text.slice(link.start, link.end);
  if (isAutoLinkedFileRef(href, label)) return null;
  return { start: link.start, end: link.end, open: `<a href="${escapeHtmlAttr(href)}">`, close: '</a>' };
}

function renderMarkdownWithMarkers(ir: MarkdownIR): string {
  const text = ir.text ?? '';
  if (!text) return '';
  const styled = sortStyleSpans(ir.styles);
  const boundaries = new Set<number>([0, text.length]);
  const startsAt = new Map<number, MarkdownStyleSpan[]>();
  for (const span of styled) {
    boundaries.add(span.start);
    boundaries.add(span.end);
    const bucket = startsAt.get(span.start) ?? [];
    bucket.push(span);
    startsAt.set(span.start, bucket);
  }
  const linkStarts = new Map<number, RenderLink[]>();
  for (const link of ir.links) {
    const rendered = buildTelegramLink(link, text);
    if (!rendered) continue;
    boundaries.add(rendered.start);
    boundaries.add(rendered.end);
    const bucket = linkStarts.get(rendered.start) ?? [];
    bucket.push(rendered);
    linkStarts.set(rendered.start, bucket);
  }
  const markers: Record<MarkdownStyle, { open: string; close: string }> = {
    bold: { open: '<b>', close: '</b>' },
    italic: { open: '<i>', close: '</i>' },
    strikethrough: { open: '<s>', close: '</s>' },
    code: { open: '<code>', close: '</code>' },
    code_block: { open: '<pre><code>', close: '</code></pre>' },
    spoiler: { open: '<tg-spoiler>', close: '</tg-spoiler>' },
    blockquote: { open: '<blockquote>', close: '</blockquote>' },
  };
  const points = [...boundaries].sort((a, b) => a - b);
  const stack: Array<{ end: number; close: string }> = [];
  let out = '';
  for (let i = 0; i < points.length; i += 1) {
    const pos = points[i];
    while (stack.length && stack[stack.length - 1].end === pos) out += stack.pop()!.close;
    const opening: Array<{ end: number; open: string; close: string; kind: 'link' | 'style'; rank: number; index: number }> = [];
    (linkStarts.get(pos) ?? []).forEach((link, index) => opening.push({ end: link.end, open: link.open, close: link.close, kind: 'link', rank: -1, index }));
    (startsAt.get(pos) ?? []).forEach((span, index) => opening.push({ end: span.end, open: markers[span.style].open, close: markers[span.style].close, kind: 'style', rank: STYLE_RANK.get(span.style) ?? 0, index }));
    opening.sort((a, b) => (b.end - a.end) || ((a.kind === 'link' ? -1 : 1) - (b.kind === 'link' ? -1 : 1)) || (a.rank - b.rank) || (a.index - b.index));
    for (const item of opening) {
      out += item.open;
      stack.push({ end: item.end, close: item.close });
    }
    const next = points[i + 1];
    if (next !== undefined && next > pos) out += escapeHtml(text.slice(pos, next));
  }
  return out;
}

function wrapSegmentFileRefs(text: string, codeDepth: number, preDepth: number, anchorDepth: number): string {
  if (!text || codeDepth > 0 || preDepth > 0 || anchorDepth > 0) return text;
  const wrapped = text.replace(FILE_REFERENCE_PATTERN, (match, prefix: string, filename: string) => {
    if (filename.startsWith('//')) return match;
    if (/https?:\/\/$/i.test(prefix)) return match;
    return `${prefix}<code>${escapeHtml(filename)}</code>`;
  });
  return wrapped.replace(ORPHANED_TLD_PATTERN, (match, prefix: string, tld: string) => (
    prefix === '>' ? match : `${prefix}<code>${escapeHtml(tld)}</code>`
  ));
}

export function wrapFileReferencesInHtml(html: string): string {
  AUTO_LINKED_ANCHOR_PATTERN.lastIndex = 0;
  const deLinkified = html.replace(AUTO_LINKED_ANCHOR_PATTERN, (match, label: string) => (
    isAutoLinkedFileRef(`http://${label}`, label) ? `<code>${escapeHtml(label)}</code>` : match
  ));
  let codeDepth = 0;
  let preDepth = 0;
  let anchorDepth = 0;
  let result = '';
  let lastIndex = 0;
  HTML_TAG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HTML_TAG_PATTERN.exec(deLinkified)) !== null) {
    const [full, closeToken, tagNameRaw] = match;
    const tagStart = match.index;
    const tagEnd = tagStart + full.length;
    result += wrapSegmentFileRefs(deLinkified.slice(lastIndex, tagStart), codeDepth, preDepth, anchorDepth);
    const tagName = tagNameRaw.toLowerCase();
    const isClosing = closeToken === '</';
    if (tagName === 'code') codeDepth = isClosing ? Math.max(0, codeDepth - 1) : codeDepth + 1;
    else if (tagName === 'pre') preDepth = isClosing ? Math.max(0, preDepth - 1) : preDepth + 1;
    else if (tagName === 'a') anchorDepth = isClosing ? Math.max(0, anchorDepth - 1) : anchorDepth + 1;
    result += full;
    lastIndex = tagEnd;
  }
  result += wrapSegmentFileRefs(deLinkified.slice(lastIndex), codeDepth, preDepth, anchorDepth);
  return result;
}

export function markdownToTelegramHtml(markdown: string, options: { tableMode?: MarkdownTableMode; wrapFileRefs?: boolean } = {}): string {
  const ir = markdownToIR(markdown ?? '', {
    linkify: true,
    enableSpoilers: true,
    headingStyle: 'none',
    blockquotePrefix: '',
    tableMode: options.tableMode,
  });
  const html = renderMarkdownWithMarkers(ir);
  return options.wrapFileRefs === false ? html : wrapFileReferencesInHtml(html);
}

function parseFenceSpans(text: string): FenceSpan[] {
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const spans: FenceSpan[] = [];
  let offset = 0;
  let open: Omit<FenceSpan, 'end'> | undefined;
  for (const line of lines) {
    const match = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
    if (match) {
      const indent = match[1] ?? '';
      const marker = match[2] ?? '```';
      if (!open) open = { start: offset, marker, indent, openLine: line };
      else if (open.marker[0] === marker[0] && marker.length >= open.marker.length) {
        spans.push({ ...open, end: offset + line.length });
        open = undefined;
      }
    }
    offset += line.length + 1;
  }
  if (open) spans.push({ ...open, end: normalized.length });
  return spans;
}

function findFenceSpanAt(spans: FenceSpan[], index: number): FenceSpan | undefined {
  return spans.find((span) => index > span.start && index < span.end);
}

function isSafeFenceBreak(spans: FenceSpan[], index: number): boolean {
  return !findFenceSpanAt(spans, index);
}

function scanParenAwareBreakpoints(window: string, isAllowed: (index: number) => boolean = () => true): { lastNewline: number; lastWhitespace: number } {
  let lastNewline = -1;
  let lastWhitespace = -1;
  let depth = 0;
  for (let i = 0; i < window.length; i += 1) {
    if (!isAllowed(i)) continue;
    const char = window[i];
    if (char === '(') { depth += 1; continue; }
    if (char === ')' && depth > 0) { depth -= 1; continue; }
    if (depth !== 0) continue;
    if (char === '\n') lastNewline = i;
    else if (/\s/.test(char)) lastWhitespace = i;
  }
  return { lastNewline, lastWhitespace };
}

function chunkText(text: string, limit: number): string[] {
  if (!text) return [];
  if (limit <= 0 || text.length <= limit) return [text];
  const out: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const { lastNewline, lastWhitespace } = scanParenAwareBreakpoints(window);
    const breakIdx = lastNewline > 0 ? lastNewline : lastWhitespace > 0 ? lastWhitespace : limit;
    const raw = remaining.slice(0, breakIdx);
    if (!raw) break;
    out.push(raw);
    const brokeOnSeparator = breakIdx < remaining.length && /\s/.test(remaining[breakIdx]);
    remaining = remaining.slice(Math.min(remaining.length, breakIdx + (brokeOnSeparator ? 1 : 0)));
  }
  if (remaining) out.push(remaining);
  return out;
}

function chunkByParagraph(text: string, limit: number, opts?: { splitLongParagraphs?: boolean }): string[] {
  if (!text) return [];
  if (limit <= 0) return [text];
  const normalized = text.replace(/\r\n?/g, '\n');
  const paragraphRe = /\n[\t ]*\n+/;
  const splitLongParagraphs = opts?.splitLongParagraphs !== false;
  if (!paragraphRe.test(normalized)) {
    if (normalized.length <= limit || !splitLongParagraphs) return [normalized];
    return chunkText(normalized, limit);
  }
  const spans = parseFenceSpans(normalized);
  const parts: string[] = [];
  let lastIndex = 0;
  for (const match of normalized.matchAll(/\n[\t ]*\n+/g)) {
    const idx = match.index ?? 0;
    if (!isSafeFenceBreak(spans, idx)) continue;
    parts.push(normalized.slice(lastIndex, idx));
    lastIndex = idx + match[0].length;
  }
  parts.push(normalized.slice(lastIndex));
  const out: string[] = [];
  for (const part of parts) {
    const paragraph = part.replace(/\s+$/g, '');
    if (!paragraph.trim()) continue;
    if (paragraph.length <= limit || !splitLongParagraphs) out.push(paragraph);
    else out.push(...chunkText(paragraph, limit));
  }
  return out;
}

function stripLeadingNewlines(value: string): string {
  let i = 0;
  while (i < value.length && value[i] === '\n') i += 1;
  return i > 0 ? value.slice(i) : value;
}

function pickSafeBreakIndex(window: string, spans: FenceSpan[]): number {
  const { lastNewline, lastWhitespace } = scanParenAwareBreakpoints(window, (index) => isSafeFenceBreak(spans, index));
  if (lastNewline > 0) return lastNewline;
  if (lastWhitespace > 0) return lastWhitespace;
  return -1;
}

function chunkMarkdownText(text: string, limit: number): string[] {
  if (!text) return [];
  if (limit <= 0 || text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const spans = parseFenceSpans(remaining);
    const window = remaining.slice(0, limit);
    const softBreak = pickSafeBreakIndex(window, spans);
    let breakIdx = softBreak > 0 ? softBreak : limit;
    const initialFence = isSafeFenceBreak(spans, breakIdx) ? undefined : findFenceSpanAt(spans, breakIdx);
    let fenceToSplit = initialFence;
    if (initialFence) {
      const closeLine = `${initialFence.indent}${initialFence.marker}`;
      const maxIdxIfNeedNewline = limit - (closeLine.length + 1);
      if (maxIdxIfNeedNewline <= 0) {
        breakIdx = limit;
        fenceToSplit = undefined;
      } else {
        const minProgressIdx = Math.min(remaining.length, initialFence.start + initialFence.openLine.length + 2);
        const maxIdxIfAlreadyNewline = limit - closeLine.length;
        let pickedNewline = false;
        let lastNewline = remaining.lastIndexOf('\n', Math.max(0, maxIdxIfAlreadyNewline - 1));
        while (lastNewline !== -1) {
          const candidateBreak = lastNewline + 1;
          if (candidateBreak < minProgressIdx) break;
          const candidateFence = findFenceSpanAt(spans, candidateBreak);
          if (candidateFence && candidateFence.start === initialFence.start) {
            breakIdx = Math.max(1, candidateBreak);
            pickedNewline = true;
            break;
          }
          lastNewline = remaining.lastIndexOf('\n', lastNewline - 1);
        }
        if (!pickedNewline) {
          if (minProgressIdx > maxIdxIfAlreadyNewline) {
            breakIdx = limit;
            fenceToSplit = undefined;
          } else {
            breakIdx = Math.max(minProgressIdx, maxIdxIfNeedNewline);
          }
        }
      }
      const fenceAtBreak = findFenceSpanAt(spans, breakIdx);
      fenceToSplit = fenceAtBreak && fenceAtBreak.start === initialFence.start ? fenceAtBreak : undefined;
    }
    let rawChunk = remaining.slice(0, breakIdx);
    if (!rawChunk) break;
    const brokeOnSeparator = breakIdx < remaining.length && /\s/.test(remaining[breakIdx]);
    let next = remaining.slice(Math.min(remaining.length, breakIdx + (brokeOnSeparator ? 1 : 0)));
    if (fenceToSplit) {
      const closeLine = `${fenceToSplit.indent}${fenceToSplit.marker}`;
      rawChunk = rawChunk.endsWith('\n') ? `${rawChunk}${closeLine}` : `${rawChunk}\n${closeLine}`;
      next = `${fenceToSplit.openLine}\n${next}`;
    } else {
      next = stripLeadingNewlines(next);
    }
    chunks.push(rawChunk);
    remaining = next;
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function chunkMarkdownTextWithMode(text: string, limit: number, mode: ChunkMode): string[] {
  if (mode === 'newline') {
    const paragraphChunks = chunkByParagraph(text, limit, { splitLongParagraphs: false });
    const out: string[] = [];
    for (const chunk of paragraphChunks) {
      const nested = chunkMarkdownText(chunk, limit);
      if (!nested.length && chunk) out.push(chunk);
      else out.push(...nested);
    }
    return out;
  }
  return chunkMarkdownText(text, limit);
}

export function chunkMarkdownIR(ir: MarkdownIR, limit: number): MarkdownIR[] {
  if (!ir.text) return [];
  if (limit <= 0 || ir.text.length <= limit) return [ir];
  const chunks = chunkText(ir.text, limit);
  const out: MarkdownIR[] = [];
  let cursor = 0;
  chunks.forEach((chunk, index) => {
    if (!chunk) return;
    if (index > 0) while (cursor < ir.text.length && /\s/.test(ir.text[cursor] ?? '')) cursor += 1;
    const start = cursor;
    const end = Math.min(ir.text.length, start + chunk.length);
    out.push({ text: chunk, styles: sliceStyleSpans(ir.styles, start, end), links: sliceLinkSpans(ir.links, start, end) });
    cursor = end;
  });
  return out;
}

function splitMarkdownIRPreserveWhitespace(ir: MarkdownIR, limit: number): MarkdownIR[] {
  if (!ir.text) return [];
  const normalizedLimit = Math.max(1, Math.floor(limit));
  if (ir.text.length <= normalizedLimit) return [ir];
  const out: MarkdownIR[] = [];
  for (let cursor = 0; cursor < ir.text.length; cursor += normalizedLimit) {
    const end = Math.min(ir.text.length, cursor + normalizedLimit);
    out.push({ text: ir.text.slice(cursor, end), styles: sliceStyleSpans(ir.styles, cursor, end), links: sliceLinkSpans(ir.links, cursor, end) });
  }
  return out;
}

function splitTelegramChunkByHtmlLimit(chunk: MarkdownIR, htmlLimit: number, renderedHtmlLength: number): MarkdownIR[] {
  if (chunk.text.length <= 1) return [chunk];
  const proportionalLimit = Math.floor((chunk.text.length * htmlLimit) / Math.max(renderedHtmlLength, 1));
  const candidateLimit = Math.min(chunk.text.length - 1, proportionalLimit);
  const splitLimit = Number.isFinite(candidateLimit) && candidateLimit > 0 ? candidateLimit : Math.max(1, Math.floor(chunk.text.length / 2));
  const split = splitMarkdownIRPreserveWhitespace(chunk, splitLimit);
  return split.length > 1 ? split : splitMarkdownIRPreserveWhitespace(chunk, Math.max(1, Math.floor(chunk.text.length / 2)));
}

function renderTelegramChunksWithinHtmlLimit(ir: MarkdownIR, limit: number): TelegramFormattedChunk[] {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const pending = chunkMarkdownIR(ir, normalizedLimit);
  const rendered: TelegramFormattedChunk[] = [];
  while (pending.length) {
    const chunk = pending.shift();
    if (!chunk) continue;
    const html = wrapFileReferencesInHtml(renderMarkdownWithMarkers(chunk));
    if (html.length <= normalizedLimit || chunk.text.length <= 1) {
      rendered.push({ html, text: chunk.text });
      continue;
    }
    const split = splitTelegramChunkByHtmlLimit(chunk, normalizedLimit, html.length);
    if (split.length <= 1) {
      rendered.push({ html, text: chunk.text });
      continue;
    }
    pending.unshift(...split);
  }
  return rendered;
}

export function markdownToTelegramChunks(markdown: string, limit: number, options: { tableMode?: MarkdownTableMode } = {}): TelegramFormattedChunk[] {
  const ir = markdownToIR(markdown ?? '', {
    linkify: true,
    enableSpoilers: true,
    headingStyle: 'none',
    blockquotePrefix: '',
    tableMode: options.tableMode,
  });
  return renderTelegramChunksWithinHtmlLimit(ir, limit);
}

export function renderTelegramHtmlSegments(
  markdown: string,
  options: { limit?: number; tableMode?: MarkdownTableMode; chunkMode?: ChunkMode } = {},
): string[] {
  const limit = options.limit ?? 4000;
  const chunkMode = options.chunkMode ?? 'length';
  const markdownChunks = chunkMode === 'newline' ? chunkMarkdownTextWithMode(markdown, limit, chunkMode) : [markdown];
  const chunks: TelegramFormattedChunk[] = [];
  for (const chunk of markdownChunks) {
    const nested = markdownToTelegramChunks(chunk, limit, { tableMode: options.tableMode });
    if (!nested.length && chunk) {
      chunks.push({ html: wrapFileReferencesInHtml(markdownToTelegramHtml(chunk, { tableMode: options.tableMode, wrapFileRefs: false })), text: chunk });
      continue;
    }
    chunks.push(...nested);
  }
  return chunks.map((chunk) => chunk.html).filter(Boolean);
}
