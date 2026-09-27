/** Channel messages need the transcript, without the tool's metadata wrapper. */
export function getTranscriptionText(output: unknown): string | undefined {
  if (typeof output === 'string') {
    const wrapped =
      /^(?:<system-reminder>[\s\S]*?<\/system-reminder>\n)?<transcription-text>\n([\s\S]*)\n<\/transcription-text>$/.exec(
        output,
      );
    return (wrapped ? wrapped[1] : output).trim() || undefined;
  }
  // Accept older persisted/mocked tool results while callers migrate.
  if (
    output &&
    typeof output === 'object' &&
    'text' in output &&
    typeof output.text === 'string'
  ) {
    return output.text.trim() || undefined;
  }
  return undefined;
}
