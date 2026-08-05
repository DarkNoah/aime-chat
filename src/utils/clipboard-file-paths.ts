const decodeXmlEntities = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#([0-9]+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const isAbsoluteFilePath = (value: string) =>
  value.startsWith('/') ||
  /^[A-Za-z]:[\\/]/.test(value) ||
  /^\\\\[^\\]+\\[^\\]+/.test(value) ||
  /^\/\/[^/]+\//.test(value);

const getAbsoluteFilePaths = (value: string): string[] =>
  value
    .split(/\0+|\r?\n/)
    .map((entry) => entry.trim())
    .filter(isAbsoluteFilePath);

export const getFilePathsFromUriList = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .flatMap((line) => {
      try {
        const url = new URL(line);
        if (url.protocol !== 'file:') {
          return [];
        }

        let filePath = decodeURIComponent(url.pathname);
        if (/^\/[A-Za-z]:\//.test(filePath)) {
          filePath = filePath.slice(1);
        }
        if (url.hostname) {
          filePath = `//${url.hostname}${filePath}`;
        }
        return [filePath];
      } catch {
        return [];
      }
    });

const getMacFilenamePaths = (value: string): string[] => {
  const xmlPaths = Array.from(value.matchAll(/<string>([\s\S]*?)<\/string>/g))
    .map((match) => decodeXmlEntities(match[1]).trim())
    .filter(isAbsoluteFilePath);

  return xmlPaths.length > 0 ? xmlPaths : getAbsoluteFilePaths(value);
};

export const getFilePathsFromClipboardFormats = (
  formats: string[],
  readFormat: (format: string) => string,
): string[] => {
  const paths = formats.flatMap((format) => {
    const normalizedFormat = format.toLowerCase();
    const isWindowsFilename = normalizedFormat === 'filenamew';
    const isMacFilenames = normalizedFormat === 'nsfilenamespboardtype';
    const isFileUri =
      normalizedFormat === 'public.file-url' ||
      normalizedFormat === 'text/uri-list' ||
      normalizedFormat === 'x-special/gnome-copied-files';

    if (!isWindowsFilename && !isMacFilenames && !isFileUri) {
      return [];
    }

    let value = '';
    try {
      value = readFormat(format);
    } catch {
      return [];
    }
    if (!value) {
      return [];
    }

    if (isWindowsFilename) {
      return getAbsoluteFilePaths(value);
    }
    if (isMacFilenames) {
      return getMacFilenamePaths(value);
    }
    return getFilePathsFromUriList(value);
  });

  return Array.from(new Set(paths));
};
