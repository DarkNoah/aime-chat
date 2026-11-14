import path from 'path';

export function hasHiddenPathSegment(value: string): boolean {
  let decodedValue = value;
  try {
    decodedValue = decodeURIComponent(value);
  } catch {
    // Keep the original value when it contains malformed URL encoding.
  }

  return decodedValue
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean)
    .some(
      (segment) =>
        segment.startsWith('.') && segment !== '.' && segment !== '..',
    );
}

export function getSkillGroupDirName(
  group: string | null | undefined,
): string | undefined {
  const name = group?.trim();
  if (!name || name.startsWith('.') || /[\\/:*?"<>|\0]/.test(name)) {
    return undefined;
  }

  return name;
}

export function isSamePathOrInside(parentPath: string, childPath: string) {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}
