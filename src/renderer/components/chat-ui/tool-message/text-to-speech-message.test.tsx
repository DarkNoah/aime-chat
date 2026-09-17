import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ToolUIPart } from 'ai';
import type { FileInfo } from '@/types/common';
import { TextToSpeechMessage } from './text-to-speech-message';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const audioPath =
  '/Volumes/Data/workspace/PanelFlow/花甲公主/chapter-01/voices/_tts-test.wav';
const getFileInfo = jest.fn();
const file: FileInfo = {
  path: audioPath,
  name: '_tts-test.wav',
  isExist: true,
  isFile: true,
  mimeType: 'audio/wav',
};
const part = {
  type: 'tool-TextToSpeech',
  toolCallId: 'speech-1',
  state: 'output-available',
  input: { text: '你好，公主。\n这是第二行。' },
  output: `Generated speech audio (4.2s, 24000Hz) saved to: \n<file>${audioPath}</file>`,
} as ToolUIPart;

beforeEach(() => {
  getFileInfo.mockReset().mockResolvedValue(file);
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: { app: { getFileInfo } },
  });
});

it('extracts the generated file path and keeps the full speech text', async () => {
  render(<TextToSpeechMessage part={part} />);
  const audio = await screen.findByLabelText('_tts-test.wav');
  expect(getFileInfo).toHaveBeenCalledWith(audioPath);
  expect(audio).toHaveAttribute('src', `file://${encodeURI(audioPath)}`);
  expect(audio).toHaveAttribute('controls');
  expect(audio).not.toHaveAttribute('autoplay');
  expect(
    document.getElementById(audio.getAttribute('aria-describedby'))
      ?.textContent,
  ).toBe('你好，公主。\n这是第二行。');
});

it.each([
  { isFile: undefined },
  { mimeType: undefined },
  { mimeType: 'application/octet-stream' },
])(
  'plays a WAV when optional file metadata is incomplete: %j',
  async (metadata) => {
    getFileInfo.mockResolvedValue({ ...file, ...metadata });
    render(<TextToSpeechMessage part={part} />);
    expect(await screen.findByLabelText('_tts-test.wav')).toBeInTheDocument();
    expect(screen.queryByText('chat.speech_audio_unavailable')).toBeNull();
  },
);

it('identifies a missing file and shows its exact path', async () => {
  getFileInfo.mockResolvedValue({ path: audioPath, isExist: false });
  const { container } = render(<TextToSpeechMessage part={part} />);
  expect(
    await screen.findByText('chat.speech_audio_missing'),
  ).toBeInTheDocument();
  expect(screen.getByText(audioPath)).toBeInTheDocument();
  expect(container.querySelector('audio')).toBeNull();
  expect(screen.queryByText('chat.speech_audio_unavailable')).toBeNull();
});

it('keeps decoder errors distinct from a missing file', async () => {
  render(<TextToSpeechMessage part={part} />);
  fireEvent.error(await screen.findByLabelText('_tts-test.wav'));
  expect(screen.getByText('chat.speech_audio_unavailable')).toBeInTheDocument();
  expect(screen.getByText(audioPath)).toBeInTheDocument();
  expect(screen.queryByText('chat.speech_audio_missing')).toBeNull();
});

it('handles file lookup failures without hiding the speech text', async () => {
  getFileInfo.mockRejectedValue(new Error('File lookup failed'));
  render(<TextToSpeechMessage part={part} />);
  expect(
    await screen.findByText('chat.speech_audio_unavailable'),
  ).toBeInTheDocument();
  expect(screen.getByText(/你好，公主/)).toBeInTheDocument();
});

it('ignores an obsolete file lookup after the result changes', async () => {
  let resolveFile: (value: FileInfo) => void;
  getFileInfo.mockReturnValue(
    new Promise<FileInfo>((resolve) => {
      resolveFile = resolve;
    }),
  );
  const { container, rerender } = render(<TextToSpeechMessage part={part} />);
  rerender(
    <TextToSpeechMessage
      part={
        { ...part, state: 'input-available', output: undefined } as ToolUIPart
      }
    />,
  );
  await act(async () => resolveFile(file));
  expect(container.querySelector('audio')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
});
