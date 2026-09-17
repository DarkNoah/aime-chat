# Breeze TTS 2 Prompts

Use for `BreezeBlue/Breeze-TTS-2` and the local `mlx-community/Breeze-TTS-2-mlx` variants, including `-4bit` and `-8bit`. Quantization does not call for a different prompt template; the MLX build is a community port.

## Voice design, cloning, and direction

| Intent | Prompt fields in the built-in speech tool |
| --- | --- |
| Design a new voice | `text` + `instruct` |
| Clone a reference voice | `text` + `ref_audio` + `ref_text` |
| Direct a reference voice | `text` + `ref_audio` + `ref_text` + `instruct` |

Write English instructions for English speech and Chinese instructions for Chinese speech. Include any required accent or dialect in `instruct`. Omit `voice`, or use `S0`; the local adapter accepts no other speaker tag. `S0` is not a preset voice identity. The adapter supplies guidance strength when `instruct` is present; it is not part of the prompt text.

The model's reference, instruction-language, and event conventions are documented in the [official model card](https://huggingface.co/BreezeBlue/Breeze-TTS-2). The [MLX model card](https://huggingface.co/mlx-community/Breeze-TTS-2-mlx) identifies the community variants.

## Vocal Events: language changes the syntax

Insert events in `text` at the intended point. Keep ASCII delimiters and the exact token spelling:

| Audible event | English speech | Chinese speech |
| --- | --- | --- |
| Laugh | `(laugh)` | `[笑]` |
| Cough | `(cough)` | `[咳嗽]` |
| Clear the throat | `(clears throat)` | `[清嗓子]` |
| Sigh | `(sigh)` | `[叹气]` |

These are the official examples, not an exhaustive vocabulary. Verify additional events before presenting them as supported controls. Do not substitute MiniMax spellings such as `(laughs)` or `(clear-throat)`.

Use `instruct` for the sustained delivery and inline tags for individual actions. For example, “speak with quiet relief” describes a tone; `[叹气]` requests an audible event. Do not put the whole voice description inside event brackets.

For a bilingual script, the official card gives separate English and Chinese conventions, not a documented mixed-language tag rule. If practical, prepare separate language segments with matching instructions. Preserve intentional code-switching and verify it with a short sample instead of claiming a guaranteed mixed syntax.

## Chinese voice design with a laugh

```text
text: [笑] 你来得正好，我们刚准备出发。
instruct: 年轻成年女性，中音区，音色明亮，普通话清晰。像和熟悉的朋友说话，轻松愉快，语速自然。
```

## English voice design with a sigh

```text
text: (sigh) The lights are still on. Someone must be waiting for us.
instruct: An adult man with a low, lightly textured voice and a neutral American accent. Speak with quiet relief, a measured pace, and gentle phrase endings.
```

## Clone a voice without redesigning it

As with all local speech models, generation without a reused reference can produce a different timbre; neither the same `instruct` nor `S0` fixes the voice. For a recurring character or narrator, [create and reuse a local voice](../SKILL.md#reuse-a-consistent-local-voice), passing its reference recording and transcript every time.

Use the supplied recording and its actual transcript. The path and transcript below are illustrative and must refer to a real matching input:

```text
ref_audio: reference.wav
ref_text: 这是我为你录下的一小段声音。
text: [清嗓子] 接下来，我想讲讲今天发生的事。
```

Omit `instruct` when the request is simply to retain the reference delivery.

## Direct the same voice in Chinese or English

Use each example with an appropriate reference recording and exact `ref_text`:

```text
text: [叹气] 终于到家了，先坐下来休息一会儿吧。
instruct: 保留参考说话人的音色。表现出疲惫后的放松，语速稍慢，音量柔和，句尾自然收住。
```

```text
text: (clears throat) I have one more detail to explain before we begin.
instruct: Retain the reference speaker's voice. Use a composed, matter-of-fact delivery, with a deliberate pace and clear consonants.
```

These are original prompt examples, not audio quality claims. Keep the user's transcript unchanged when adapting them.
