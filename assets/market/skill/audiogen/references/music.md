# Music Prompts

Use for songs or instrumental music. A spoken TTS script with vocal event tags is not a music prompt.

Describe the genre, mood, tempo or groove, instruments, vocal delivery, arrangement changes, and ending as needed. Follow the user's intended language and preserve supplied lyrics. Treat tempo and duration in prose as goals, not exact guarantees.

## MiniMax Music 3.0 and 2.6

Both `music-3.0` and `music-2.6` use the same prompt fields in this application:

- `prompt`: Style and arrangement brief; required here, 1–2000 characters.
- `lyrics`: Words to sing, up to 3500 characters, with line breaks. Put structure labels such as `[Verse]`, `[Chorus]`, and `[Bridge]` in this field.
- `is_instrumental: true`: Request music without vocals and omit lyrics.

For a vocal song, omitting `lyrics` makes the current adapter request automatic lyric creation. Do so only when writing lyrics is part of the request; supplied lyrics belong in `lyrics`, not embedded in the style brief. The [MiniMax music specification](https://platform.minimax.io/docs/api-reference/music-generation) documents the shared syntax and API access restrictions; a configured model name does not establish account access.

### Chinese song with supplied lyrics

```text
prompt: 轻快的中文民谣，木吉他主导，配柔和贝斯和轻鼓点，中速，成年女声自然亲切。主歌编配疏朗，副歌增加和声，结尾轻轻收束。
lyrics:
[Verse]
把窗打开让风进来
今天的云走得很慢
[Chorus]
沿着小路向前看
每一步都有新的答案
is_instrumental: false
```

The lyrics above are original examples. Replace them with the user's words when lyrics are supplied.

### Instrumental background track

```text
prompt: A calm instrumental jazz piece for a quiet reading room. Soft piano leads over upright bass and brushed drums, with a relaxed swing, sparse phrasing, and a gentle ending. No vocals or vocal textures.
is_instrumental: true
```

Do not add speech tags such as `[笑]` or `(sighs)` as song-section controls. `[Chorus]` labels a musical section, not a vocal event.

## ElevenLabs Music V1

The repository lists `music_v1`, but its current provider forwards only `prompt`. Put genre, mood, instrumentation, vocal/instrumental intent, and progression in one natural-language brief; separate `lyrics` and `is_instrumental` fields are not forwarded by this adapter.

```text
prompt: An instrumental chamber piece with a lyrical cello melody, soft piano accompaniment, and restrained strings. Begin quietly, build to a warm central passage, then return to a delicate ending. No singing, humming, or spoken words.
```

The [ElevenLabs music guide](https://elevenlabs.io/docs/eleven-api/guides/cookbooks/music) describes prompt-based composition and additional upstream controls. Its newer model examples do not change the application's configured model or expose those controls here.

The current ElevenLabs adapter also does not normalize the SDK audio result into the URL/file result expected by `MusicGeneration`. This guide supports preparing its prompt; do not report completed in-app generation without an actual successful tool result. A prompt rewrite cannot resolve that output-contract limitation.
