# VoxCPM2 Prompts

Use for `openbmb/VoxCPM2` and `mlx-community/VoxCPM2-{bf16,8bit,4bit}`.

## Voice description versus event tag

Upstream VoxCPM2 places a natural-language voice/style description in parentheses at the beginning of `text`. For example, this is a complete description prefix, not a named vocal event:

```text
(An adult narrator, low register, steady and reassuring)The next train arrives in ten minutes.
```

The [official model card](https://huggingface.co/openbmb/VoxCPM2) documents this prefix and reference-based control. The [MLX model card](https://huggingface.co/mlx-community/VoxCPM2-bf16) also exposes a separate `instruct` field.

For the built-in speech tool, prefer plain `text` plus `instruct`. The local PyTorch adapter wraps and prepends `instruct`; the MLX adapter passes it to the model. Do not put the same description in both fields. If adapting an existing upstream prompt that already has the parenthesized prefix, keep it in `text` and omit the duplicate `instruct`.

## Voice design

Omit `voice` and references. Describe identity and delivery in natural language:

```text
text: 雨已经停了，我们可以继续往前走。
instruct: 成年女性，中音区，声音清亮，普通话自然，语气平静而有信心，语速适中。
```

```text
text: The rain has stopped. We can keep moving.
instruct: An adult man with a resonant midrange voice, a neutral American accent, and a calm, confident delivery at a moderate pace.
```

For Chinese descriptions in an upstream prefix, use ASCII parentheses as well: `(平静、清晰的成年女声)雨已经停了。` Do not replace them with Breeze's Chinese event brackets.

## Reference voice and performance

As with all local speech models, generation without a reused reference can vary in timbre between calls. For the same speaker across several clips, [save and reuse a local voice](../SKILL.md#reuse-a-consistent-local-voice) instead of repeating only its description.

In the built-in tool, supply `ref_audio` with accurate `ref_text`. Use `instruct` only if a change in delivery is requested. For example, with a real matching reference:

```text
ref_audio: reference.wav
ref_text: 我会在车站门口等你。
text: 看到你平安回来，我就放心了。
instruct: 保留参考音色，语速略慢，语气放松而温暖。
```

Although upstream supports reference-only cloning and separate continuation inputs, do not omit the transcript or introduce `prompt_audio`/`prompt_text` fields into the built-in tool. Its public reference fields are `ref_audio` and `ref_text`.

VoxCPM2 can infer delivery from the sentence itself. Keep the script plain for ordinary narration; add a concise description when specific control is needed. Neither a style prefix nor multilingual support establishes a Breeze-compatible list of `(laugh)` or `[笑]` events.
