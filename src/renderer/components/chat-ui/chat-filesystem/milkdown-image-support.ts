import { toFileUrl } from './file-workspace-utils';

const URL_SCHEME_PATTERN = /^([a-z][a-z\d+.-]*):/i;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-z]:[\\/]/i;
const WINDOWS_UNC_PATH_PATTERN = /^\\\\/;
const SAFE_IMAGE_SCHEMES = new Set(['blob', 'file', 'http', 'https']);
const RAW_IMAGE_WRAPPER_TAGS = new Set(['DIV', 'P', 'PICTURE', 'SPAN']);

export type ImageUrlResolver = (source: string) => string;

function decodeMarkdownPath(source: string): string {
  try {
    return decodeURI(source);
  } catch {
    return source;
  }
}

export function resolveMarkdownImageUrl(
  imageSource: string,
  markdownFilePath: string,
): string {
  const source = imageSource.trim();
  if (!source) return '';

  if (WINDOWS_ABSOLUTE_PATH_PATTERN.test(source)) {
    return toFileUrl(decodeMarkdownPath(source));
  }
  if (WINDOWS_UNC_PATH_PATTERN.test(source)) {
    return toFileUrl(decodeMarkdownPath(source));
  }
  if (source.startsWith('//')) return `https:${source}`;
  if (source.startsWith('/')) return toFileUrl(decodeMarkdownPath(source));

  const scheme = source.match(URL_SCHEME_PATTERN)?.[1]?.toLowerCase();
  if (scheme) {
    if (scheme === 'data') {
      return /^data:image\//i.test(source) ? source : '';
    }
    return SAFE_IMAGE_SCHEMES.has(scheme) ? source : '';
  }

  try {
    return new URL(source.replaceAll('\\', '/'), toFileUrl(markdownFilePath))
      .href;
  } catch {
    return '';
  }
}

export async function createLocalImageUrl(
  file: File,
  getPathForFile: (selectedFile: File) => string,
): Promise<string> {
  const filePath = getPathForFile(file);
  if (!filePath) throw new Error('Unable to resolve the selected image path');
  return toFileUrl(filePath);
}

function copyDimension(
  source: Element,
  target: HTMLImageElement,
  attribute: 'height' | 'width',
) {
  const value = source.getAttribute(attribute)?.trim();
  if (!value) return;

  const percent = /^(\d+(?:\.\d+)?)%$/.exec(value);
  if (percent) {
    const amount = Number(percent[1]);
    if (amount > 0 && amount <= 100) target.setAttribute(attribute, value);
    return;
  }

  const pixels = /^(\d+(?:\.\d+)?)(?:px)?$/i.exec(value);
  if (!pixels) return;
  const amount = Number(pixels[1]);
  if (amount > 0 && amount <= 4096) {
    target.setAttribute(attribute, pixels[1]);
  }
}

function containsOnlyImageMarkup(node: Node): boolean {
  return Array.from(node.childNodes).every((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      return !child.textContent?.trim();
    }
    if (!(child instanceof Element)) return false;
    if (child.tagName === 'IMG') return true;
    if (!RAW_IMAGE_WRAPPER_TAGS.has(child.tagName)) return false;
    return containsOnlyImageMarkup(child);
  });
}

export function renderRawHtmlImages(
  container: HTMLElement,
  rawValue: unknown,
  resolveImageUrl: ImageUrlResolver,
): boolean {
  const raw = typeof rawValue === 'string' ? rawValue : '';
  container.dataset.type = 'html';
  container.dataset.value = raw;
  container.contentEditable = 'false';
  container.className = '';
  container.replaceChildren();

  const Parser = container.ownerDocument.defaultView?.DOMParser ?? DOMParser;
  const parsedDocument = new Parser().parseFromString(raw, 'text/html');
  const onlyImageMarkup = containsOnlyImageMarkup(parsedDocument.body);
  const images = Array.from(parsedDocument.querySelectorAll('img[src]'))
    .map((sourceImage) => {
      const source = resolveImageUrl(sourceImage.getAttribute('src') || '');
      if (!source) return null;

      const image = container.ownerDocument.createElement('img');
      image.src = source;
      image.alt = sourceImage.getAttribute('alt') || '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.draggable = false;
      image.className = 'max-w-full rounded-md object-contain';

      const title = sourceImage.getAttribute('title');
      if (title) image.title = title;
      copyDimension(sourceImage, image, 'width');
      copyDimension(sourceImage, image, 'height');

      return image;
    })
    .filter((image): image is HTMLImageElement => image !== null);

  if (!onlyImageMarkup || images.length === 0) {
    container.textContent = raw;
    return false;
  }

  container.className =
    'milkdown-html-images my-3 flex max-w-full flex-wrap items-center justify-center gap-2';
  container.replaceChildren(...images);
  return true;
}
