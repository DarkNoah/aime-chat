import type { Root } from 'hast';
import { visit } from 'unist-util-visit';
import { getFilePathsFromUriList } from '@/utils/clipboard-file-paths';

const getRelativeFilePath = (href?: string): string | undefined => {
  if (!href || /^[\\/#?]/.test(href) || /[\0\r\n]/.test(href)) {
    return undefined;
  }
  try {
    const path = decodeURIComponent(href);
    // Check after decoding too, so encoded protocols cannot become file links.
    if (/^[\\/#?]/.test(path) || /[:\0\r\n]/.test(path)) return undefined;
    return path;
  } catch {
    return undefined;
  }
};

const resolveRelativeFilePath = (path: string, workspace: string) => {
  // Workspace is a native path, not a URL: preserve literal percent characters.
  const base = workspace.replace(/\\/g, '/');
  const root = base.match(/^(?:[A-Za-z]:\/|\/\/[^/]+\/[^/]+\/?|\/)/)?.[0];
  if (!root || /[\0\r\n]/.test(base)) return undefined;
  const segments: string[] = [];
  `${base.slice(root.length)}/${path.replace(/\\/g, '/')}`
    .split('/')
    .forEach((segment) => {
      if (segment === '..') segments.pop();
      else if (segment && segment !== '.') segments.push(segment);
    });
  return `${root.replace(/\/$/, '')}/${segments.join('/')}`;
};

export const getMarkdownFilePath = (
  href?: string,
  workspace?: string,
): string | undefined => {
  if (!href || /[\0\r\n]/.test(href)) return undefined;

  try {
    // Model-generated artifact links may prefix the local path with sandbox:.
    const localHref = href.replace(/^sandbox:/i, '');
    let filePath: string | undefined;
    if (/^file:/i.test(localHref)) {
      [filePath] = getFilePathsFromUriList(localHref);
    } else if (
      (localHref.startsWith('/') && !localHref.startsWith('//')) ||
      /^[A-Za-z]:[\\/]/.test(localHref) ||
      /^\\\\[^\\]+\\[^\\]+/.test(localHref)
    ) {
      filePath = decodeURIComponent(localHref);
    } else if (workspace) {
      const relativePath = getRelativeFilePath(href);
      if (relativePath) {
        filePath = resolveRelativeFilePath(relativePath, workspace);
      }
    }

    return filePath && !/[\0\r\n]/.test(filePath) ? filePath : undefined;
  } catch {
    return undefined;
  }
};

// File links use the desktop file handler instead of browser navigation.
// Keep their children in the tree so harden still checks nested images.
export const rehypeLocalFileLinks = () => (tree: Root) => {
  visit(tree, 'element', (node) => {
    if (
      node.tagName === 'a' &&
      typeof node.properties.href === 'string' &&
      (getMarkdownFilePath(node.properties.href) ||
        getRelativeFilePath(node.properties.href))
    ) {
      node.tagName = 'aime-file-link';
    }
  });
};
