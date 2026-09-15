const normalizePath = (path: string): string | null => {
  const normalized = path.replaceAll('\\', '/');
  const prefix = normalized.match(/^(?:[a-z]:\/|\/\/|\/)/i)?.[0];
  if (!prefix) return null;
  const segments: string[] = [];
  for (const segment of normalized.slice(prefix.length).split('/')) {
    if (segment === '..') segments.pop();
    else if (segment && segment !== '.') segments.push(segment);
  }
  return prefix + segments.join('/');
};

export function isFileWithinDirectory(
  filePath: string,
  directory: string,
): boolean {
  let file = normalizePath(filePath);
  let root = normalizePath(directory);
  if (!file || !root) return false;
  if (/^[a-z]:/i.test(root) || root.startsWith('//')) {
    file = file.toLowerCase();
    root = root.toLowerCase();
  }
  return file.startsWith(root.endsWith('/') ? root : `${root}/`);
}
