import type { Root } from 'hast';
import { visit } from 'unist-util-visit';
import { getFilePathsFromUriList } from '@/utils/clipboard-file-paths';

export const getMarkdownFilePath = (href?: string): string | undefined => {
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
      getMarkdownFilePath(node.properties.href)
    ) {
      node.tagName = 'aime-file-link';
    }
  });
};
