# Create a Local Voice

Aime Chat reads local voice samples from the Electron user data directory under `voices`.

## Directory Layout

Create one folder per voice:

```text
<userData>/voices/<voice-id>/
  audio.wav
  audio.txt
```

The folder name is the voice ID. Use stable, readable IDs such as `noah-demo`, `narrator-cn`, or `warm-female-01`.

Each voice folder must contain both files:

- `audio.wav`: The reference voice audio.
- `audio.txt`: The transcript for `audio.wav`.

Incomplete folders are ignored by the voice listing tool. If either `audio.wav` or `audio.txt` is missing, that voice will not appear in the available voice list.

## Audio File

Use a clean WAV recording with one speaker and minimal background noise. Keep the sample short enough to be easy to inspect, but long enough to capture the speaker's tone and pronunciation.

Recommended:

- Format: WAV
- Speaker: one person
- Content: natural speech
- Noise: as little background noise as possible

## Text File

`audio.txt` must match the spoken content in `audio.wav`.

Example:

```text
你好，我是一个用于本地音色克隆的参考声音。今天的天气不错，我们来测试一下语音效果。
```

Do not add notes, labels, timestamps, or Markdown formatting in `audio.txt`; keep only the spoken transcript.

## Example

```text
voices/
  narrator-cn/
    audio.wav
    audio.txt
  demo-en/
    audio.wav
    audio.txt
```

The voice listing tool returns each complete voice with:

- `id`: folder name, such as `narrator-cn`
- `audioPath`: full path to `audio.wav`
- `text`: content from `audio.txt`
