# Local Qwen3-TTS Prompts

Use for local `Qwen/Qwen3-TTS-12Hz-*` models and their `mlx-community` counterparts. Cloud `qwen3-tts-*` models use a different contract; see [Cloud speech](cloud-tts.md).

## The variant determines the prompt

| Variant | Voice input | Style input |
| --- | --- | --- |
| 1.7B VoiceDesign | Omit `voice`; describe the desired identity | `instruct` |
| 1.7B CustomVoice | Preset `voice` | Optional `instruct` for delivery |
| 0.6B CustomVoice | Preset `voice` | Omit `instruct`; instruction control is not supported |
| 1.7B Base | `ref_audio` + `ref_text` | Omit `voice` and `instruct` for cloning |
| 0.6B Base | `ref_audio` + `ref_text` | Omit `voice` and `instruct` for cloning |

The [official model matrix](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice) distinguishes these capabilities. There is no 0.6B VoiceDesign variant in the local catalog.

In the current application, `voice` selects CustomVoice; `instruct` without `voice` selects VoiceDesign; references without either select Base. A concrete model ID must match that choice. Adding `instruct` to a clone request does not enable Breeze-style voice direction: it selects a different mode or fails validation.

## VoiceDesign: describe an identity

Supply plain spoken text and a natural-language description. Include vocal range, timbre, accent, and delivery only as needed. Set `language` when the target language is known.

```text
language: Chinese
text: 沿着这条小路往前走，就能看见湖边的灯光。
instruct: 成年男性，中低音，音色柔和而略带沙哑。普通话清楚，语速舒缓，像在安静地为旅人指路。
```

```text
language: English
text: Follow the path until you see the lights beside the lake.
instruct: An adult woman with a clear midrange voice and a gentle British accent. Use an unhurried, reassuring delivery with precise articulation.
```

This prompt shape follows the [VoiceDesign model card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign); the examples are original.

## CustomVoice: keep identity in the preset

Preset IDs include `Vivian`, `Serena`, `Uncle_Fu`, `Dylan`, `Eric`, `Ryan`, `Aiden`, `Ono_Anna`, and `Sohee`. Preserve spelling and case. These are Qwen presets, not portable IDs for other models.

For 1.7B CustomVoice, describe how the preset should perform rather than trying to replace its identity:

```text
voice: Vivian
language: Chinese
text: 我找到了，钥匙就在桌上！
instruct: 带着刚刚松了一口气的喜悦，前半句稍快，后半句清晰自然。
```

```text
voice: Ryan
language: English
text: I found it. The key was on the desk all along.
instruct: Sound relieved and lightly amused, then settle into a calm finish.
```

For 0.6B CustomVoice, keep `voice`, `language`, and `text`, and omit `instruct`. Do not promise that a style description will be followed merely because a shared interface accepts the field.

## Base: let the reference supply the voice

The [reference-reuse rule for all local speech](../SKILL.md#reuse-a-consistent-local-voice) applies to every Qwen3 variant. To retain a chosen VoiceDesign or CustomVoice result, save the sample as a local voice, then use Base with that same reference pair for each new script. Repeating the instructions or preset name alone does not guarantee fixed timbre. Do not send cloning parameters to VoiceDesign or CustomVoice; select Base for subsequent reference-based generation.

Use a clean reference recording and its exact transcript. For example, if the real recording says the following sentence:

```text
ref_audio: reference.wav
ref_text: The garden is quiet early in the morning.
language: English
text: By noon, the courtyard will be full of visitors.
```

Do not replace `ref_text` with the target sentence. The built-in tool requires the transcript when a reference recording is supplied, even though upstream libraries expose other modes.

## Events and punctuation

Do not treat Breeze's `[笑]` or `(laugh)` as a documented Qwen3 event protocol. Use plain punctuation for phrasing and, on instruction-capable variants, describe the intended emotion in `instruct`. If an explicit non-speech event is essential, verify that specific model's support before adding a control token. Preserve user-written interjections rather than inventing extra spoken words to simulate an event.
