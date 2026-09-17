# Cloud Speech Prompts

Match both provider and model. Local reference recordings and local preset IDs are not interchangeable with cloud voice IDs. The built-in speech tool exposes `text`, `language`, `voice`, and `instruct`; its reference fields currently feed the local provider.

## OpenAI

| Model in the application | Prompt fields |
| --- | --- |
| `gpt-4o-mini-tts-2025-12-15` | Plain `text`, supported `voice`, optional delivery `instruct` |
| `tts-1` | Plain `text` and supported `voice`; omit `instruct` |
| `tts-1-hd` | Plain `text` and supported `voice`; omit `instruct` |

The GPT-4o mini TTS family accepts instructions for accent, emotion, pace, and tone. TTS-1 and TTS-1 HD do not support the instructions parameter. Keep direction outside the spoken script. See [Text to speech](https://developers.openai.com/api/docs/guides/text-to-speech) and [Create speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create).

Examples for GPT-4o mini TTS:

```text
voice: coral
text: Your changes have been saved. You can return to the document whenever you are ready.
instruct: Use a friendly, composed tone, a moderate pace, and a brief pause between the two sentences.
```

```text
voice: coral
text: 修改已经保存，你可以随时回来继续编辑。
instruct: 使用清晰的普通话，语速适中，语气温和，让人感到安心。
```

For either TTS-1 model, a prompt such as `voice: alloy` plus the plain script is sufficient. Do not insert Breeze or MiniMax event tags to compensate for absent instruction support. Custom voice creation and raw reference-audio cloning are not exposed through this tool's OpenAI path.

## Alibaba

| Model | Instruction rule |
| --- | --- |
| `qwen-audio-3.0-tts-plus`, `qwen-audio-3.0-tts-flash` | Natural-language `instruct` with a compatible voice |
| `qwen3-tts-instruct-flash` | Chinese or English natural-language `instruct` |
| `qwen3-tts-flash` | Omit `instruct` |
| `qwen3-tts-vd-2026-01-26`, `qwen3-tts-vc-2026-01-22` | Supply an existing Alibaba custom `voice`; omit `instruct` in this adapter |
| `cosyvoice-v3.5-plus`, `cosyvoice-v3.5-flash` | Existing custom `voice` required; natural-language `instruct` |
| `cosyvoice-v3-plus` | Check the exact system voice's fixed instruction vocabulary; custom voices do not support instruction control |
| `cosyvoice-v3-flash` | System voices need their documented fixed Chinese instruction format; custom voices accept natural-language directions |
| `cosyvoice-v2` | Omit `instruct` |

Alibaba distinguishes fixed voice instructions from free-form direction. Consult the selected voice's entry rather than inventing a format. See [Instruction control](https://www.alibabacloud.com/help/en/model-studio/realtime-tts-user-guide) and [Non-real-time speech synthesis](https://www.alibabacloud.com/help/en/model-studio/non-realtime-tts-user-guide).

For `qwen3-tts-instruct-flash`:

```text
voice: Cherry
language: Chinese
text: 下一段路程大约需要十分钟，请留意右侧的出口。
instruct: 普通话清晰，语速稍慢，像耐心说明路线一样，重点读清楚时间和方向。
```

For `qwen-audio-3.0-tts-plus` or `qwen-audio-3.0-tts-flash`:

```text
voice: longanhuan_v3.6
language: English
text: The next part of the route takes about ten minutes. Look for the exit on your right.
instruct: Speak clearly and patiently, with a measured pace and light emphasis on the time and direction.
```

For CosyVoice 3.5, use the user's existing custom voice ID. An example direction is `语速稍慢，语气温柔，吐字清晰。` or `Speak gently, slightly slower, with clear articulation.` Do not reuse that free-form instruction for a v3 system voice without checking its supported format.

The current adapter limits Qwen3 TTS scripts to 600 characters and CosyVoice instructions to a weighted length of 100, counting Han characters as two. Keep sentences intact when splitting longer text. The VD/VC names do not mean this synthesis tool creates cloud voices from `instruct` or `ref_audio`.

## MiniMax Speech

`speech-2.8-hd` and `speech-2.8-turbo` use fixed parenthesized English tokens, including in Chinese speech. The corresponding Alibaba model IDs are `MiniMax/speech-2.8-hd` and `MiniMax/speech-2.8-turbo`. Alibaba's `MiniMax/speech-02-hd` and `MiniMax/speech-02-turbo` do not inherit 2.8 interjection support.

| Event | MiniMax 2.8 token |
| --- | --- |
| Laugh | `(laughs)` |
| Cough | `(coughs)` |
| Clear the throat | `(clear-throat)` |
| Sigh | `(sighs)` |

Use these exact spellings rather than Breeze's `(laugh)`, `(clears throat)`, or `[笑]`. A timed pause uses `<#0.5#>` for half a second; it belongs between spoken segments, not at an edge or adjacent to another pause marker. See the [official HTTP speech specification](https://platform.minimax.io/docs/api-reference/speech-t2a-http) for additional supported tokens and pause limits.

```text
language: Chinese
text: 终于找到你了！(laughs) 我们走吧。<#0.5#>大家都在等你。
```

```text
language: English
text: (sighs) There you are. I was starting to worry.<#0.5#>Let's head inside.
```

Omit free-form `instruct`: the direct MiniMax adapter does not transmit it, and the Alibaba adapter rejects it. The direct adapter also currently reads the voice from provider options rather than the tool's top-level `voice`; do not promise a requested voice ID has taken effect there. Alibaba MiniMax does consume `voice`. These integration limits cannot be fixed by adding prose to `text`.
