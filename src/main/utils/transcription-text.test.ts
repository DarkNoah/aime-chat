import { getTranscriptionText } from './transcription-text';

it('extracts only transcript lines from the text tool response', () => {
  expect(
    getTranscriptionText(
      '<system-reminder>\nThis audio file duration is 2.00s.\nFile saved to: <file>/tmp/test.txt</file>\n</system-reminder>\n<transcription-text>\nHello\nWorld\n</transcription-text>',
    ),
  ).toBe('Hello\nWorld');
  expect(
    getTranscriptionText('<transcription-text>\nHello\n</transcription-text>'),
  ).toBe('Hello');
});

it('handles empty speech and older responses without leaking JSON metadata', () => {
  expect(
    getTranscriptionText('<transcription-text>\n\n</transcription-text>'),
  ).toBeUndefined();
  expect(getTranscriptionText(' hello ')).toBe('hello');
  expect(getTranscriptionText({ text: 'hello' })).toBe('hello');
  expect(
    getTranscriptionText({ diarize: false, duration: 2, segments: [] }),
  ).toBeUndefined();
});
