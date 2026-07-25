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
