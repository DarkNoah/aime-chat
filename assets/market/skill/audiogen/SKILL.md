---
name: audiogen
description: Write model-specific prompts for audio generation with the built-in speech and music tools. Use for narration, dialogue, voice design, reference-based voice cloning, expressive vocal events, songs, and instrumental music. Covers voice variation without reference audio across all local speech models and creating a reusable local voice for consistent timbre. Includes distinct Chinese and English Breeze TTS 2 syntax. Not for transcription, audio editing, or installing models.
autoInstall: true
---

# Audio Prompt Guidelines

Prepare the spoken text, voice description, or music brief for the selected model. Keep the user's words separate from performance directions, and use only that model's supported controls.

## Choose the model-specific guide

Identify the configured provider, model, and variant before adding instructions or tags. A model name in a general catalog does not establish that the built-in audio tool supports it. Read only the relevant guide below.

| Model or family | Prompt approach | Reference |
| --- | --- | --- |
| Local Breeze TTS 2, including MLX variants | `instruct` for voice design/direction; language-specific inline vocal events | [Breeze TTS 2](references/breeze-tts-2.md) |
| Local Qwen3-TTS 1.7B VoiceDesign | Voice description in `instruct`; omit `voice` | [Qwen3-TTS](references/qwen3-tts.md) |
| Local Qwen3-TTS 1.7B CustomVoice | Preset `voice` with optional performance `instruct` | [Qwen3-TTS](references/qwen3-tts.md) |
| Local Qwen3-TTS 0.6B CustomVoice | Preset `voice`; no instruction control | [Qwen3-TTS](references/qwen3-tts.md) |
| Local Qwen3-TTS 1.7B/0.6B Base | Reference recording and exact transcript; no design instruction | [Qwen3-TTS](references/qwen3-tts.md) |
| Local VoxCPM2, including MLX variants | Natural-language voice/style description; its parenthesized prefix is not a Breeze event | [VoxCPM2](references/voxcpm2.md) |
| OpenAI GPT-4o mini TTS / TTS-1 / TTS-1 HD | Instruction support differs by model | [Cloud speech](references/cloud-tts.md) |
| Alibaba Qwen Audio 3.0 / Qwen3 TTS / CosyVoice | Model and voice jointly determine instruction support | [Cloud speech](references/cloud-tts.md) |
| MiniMax Speech 2.8 / Alibaba MiniMax Speech 02 | Fixed interjection tokens apply only to 2.8 | [Cloud speech](references/cloud-tts.md) |
| MiniMax Music 3.0 / 2.6; ElevenLabs Music V1 | Separate music style from lyrics; provider controls differ | [Music](references/music.md) |

For an unlisted model, verify its current official prompt specification and the active tool's fields before introducing special syntax. If the model is unknown, keep a plain script and describe the intended delivery separately until the model is established.

## Keep the inputs distinct

- **`text`:** Words to speak, with punctuation and only verified model-specific inline controls. Do not prepend labels such as “Narrator:” unless they should be spoken or the selected model explicitly supports them.
- **`instruct`:** Voice identity or delivery directions when supported. The built-in speech field is named `instruct`, even when upstream documentation uses `instruction` or `instructions`.
- **`voice`:** An existing preset or custom identifier accepted by that provider. A prose description is not a voice ID. Locally saved reference voices are not automatically cloud voice IDs.
- **`ref_audio` + `ref_text`:** A real reference recording and its accurate transcript. The transcript describes the recording, not the new target speech. Do not invent a missing transcript.
- **Music `prompt` and `lyrics`:** Arrangement/performance brief and words to sing. Read the music guide for instrumental and provider-specific behavior.

Examples are prompt fields, not commands or complete API requests. Use the built-in tools' current configuration and schemas for execution; do not add a `model`, `cfg_scale`, or other upstream-only field to a speech prompt payload.

## Reuse a consistent local voice

Apply this rule to all local speech generation, including Breeze TTS 2, every Qwen3-TTS variant, and VoxCPM2: without a reused reference recording, timbre can vary randomly between generations. The same prompt, `instruct`, preset name, or default voice is not a guarantee of consistent timbre across clips. Always use a saved reference voice when the user needs a fixed voice.

When the user wants the same voice across clips, create or select a local reference voice once, then include its reference parameters in every generation:

1. Read [Create a Local Voice](../aime-chat-docs/references/create-local-voice.md) from `skill:local:aime-chat-docs`. Use `ListVoices` to find an existing voice and the actual `voicesPath` on the app host; do not guess the user data directory.
2. If a suitable saved voice does not exist, choose a clean recording or generate a short voice-design sample and select the desired result. Save that sample as `<voicesPath>/<voice-id>/audio.wav` and its exact spoken transcript as `audio.txt`, following the linked guide. Keep this chosen sample for subsequent requests instead of generating a new reference each time.
3. Use `ListVoices` to select the saved entry. Pass its `audioPath` as `ref_audio` and its `text` as `ref_text` on every `TextToSpeech` call; put the new script in `text`.

```text
ref_audio: <audioPath returned by ListVoices for the chosen voice>
ref_text: <text returned by ListVoices for the same voice>
text: 欢迎回来，我们继续上一段故事。
```

The local folder `id` is a lookup key, not a value to put in `TextToSpeech.voice`; that field does not resolve local voice folders. Keep the same reference recording and transcript when changing the script. Use a reference-capable model: for Qwen3, switch from VoiceDesign or CustomVoice to Base and omit `voice` and `instruct`; Breeze and VoxCPM2 can retain the reference while applying supported delivery directions. If the selected variant cannot consume references, use a compatible cloning variant for the fixed-voice requirement rather than supplying unsupported parameters. Reference reuse improves speaker consistency, but does not guarantee identical prosody or waveforms. Qwen documents this [design-then-clone workflow](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice#voice-design-then-clone), and VoxCPM2 documents [variation between design runs](https://huggingface.co/openbmb/VoxCPM2#limitations).

## Write useful performance directions

Use only the details needed for the request:

```text
Voice identity: Vocal range, age impression, timbre, accent, or dialect
Delivery: Emotion, speaking pace, energy, articulation, and phrase endings
Local events: An audible action at a particular point, using this model's syntax
Spoken text: Exact words, in the requested language
Reference: Existing recording and its matching transcript, when applicable
```

- Preserve exact wording, names, numbers, and language unless the user requests rewriting or pronunciation normalization.
- Describe audible attributes: “low register, measured pace, crisp consonants” is more useful than “premium voice.” Avoid contradictory directions such as “whisper while shouting.”
- For voice design, describe identity and delivery. For direction of a reference voice, emphasize the requested performance change while retaining the reference identity.
- Add laughs, sighs, or other events only when requested or clearly part of the intended performance. A cheerful tone does not automatically require an audible laugh.
- Keep events sparse and place them where they should happen. Do not turn ordinary parenthetical dialogue into control tags without checking its meaning.
- Treat phonetic notation, pause markers, SSML, and vocal events as different model-specific features. Do not transfer syntax across providers.
- For long narration or several characters, preserve sentence boundaries and repeat the relevant voice constraints for each segment. Do not invent multi-speaker tags for a single-speaker interface.
- In revisions, change the requested voice attribute or event and preserve the remaining brief. Do not promise exact event timing, duration, or voice consistency from prose alone.

## Prompt review

Check that the model matches the guide, spoken words remain intact, directions are in supported fields, event spelling matches the speech language and model, and reference text belongs to the reference recording. If a tag is spoken aloud or ignored, verify the model and syntax before adding more tags.

These guides were checked against the repository's audio adapters and linked upstream documentation on 2026-09-17. They document prompt preparation; they do not establish that a model is installed or that generated audio has been auditioned.
