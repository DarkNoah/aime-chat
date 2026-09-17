---
name: imagegen
description: Provide prompt guidelines and examples for image generation, creation from references, and image editing. Use for raster tasks such as photos, illustrations, product images, posters, UI mockups, infographics, and transparent-background assets. Not for directly editing existing SVG or vector source files, or implementing web interfaces in code.
autoInstall: true
---

# Image Prompt Guidelines

Write clear, specific prompts for the built-in image tools. Describe the intended image, the requested changes, and the details that must be preserved.

## Core principles

- When the user's description is already specific, organize it and resolve ambiguity without adding creative requirements.
- When the description is broad, add only composition, lighting, or material details that support the goal. Do not invent people, props, brands, slogans, or story elements.
- State the intended use, such as a website hero image, product display, or educational diagram, to guide composition and information density.
- Use observable visual requirements instead of vague praise. For example, write "soft side lighting with natural skin texture" rather than "premium quality."
- Include only fields relevant to the task. Colors, positions, copy, and constraints in examples are not defaults for every request.

## Distinguish creation and editing intent

- **New image:** Describe the scene, subjects, and their relationships, then add style, composition, and necessary constraints.
- **Creation from references:** Explain what each reference contributes, such as character appearance, palette, materials, or composition. A reference is not automatically an edit target.
- **Editing an existing image:** State what to change and what to preserve. Avoid describing a local edit as a complete redraw.
- **Compositing:** Identify the base image, subject to insert, and style reference by image number. Specify placement, scale, perspective, and lighting relationships.
- **Image series:** Describe each image's subject or variation separately. Repeat the style and character constraints needed for consistency.

## Prompt structure

Use the following structure as needed. Omit irrelevant fields; there is no need to fill in every line.

```text
Intended use: Where the image will be used
Primary request: What to generate or change
Input images: Role of Image 1; role of Image 2
Scene and background: Environment, time, and background elements
Subject: Appearance, action, count, and relationships
Style and medium: Photography, illustration, watercolor, 3D rendering, etc.
Composition and viewpoint: Framing, viewing angle, subject placement, and negative space
Lighting and mood: Light direction, softness, and overall mood
Palette and materials: Required colors, surface qualities, and details
Text in image: Exact wording and placement
Change only: Parts that may change in this iteration
Preserve: Content that must remain unchanged
Avoid: Exclusions relevant to this task
```

## Key constraints

- **Composition:** Specify left/right placement and negative space only when requested or required by the layout. Do not arbitrarily choose a side for copy.
- **Text in images:** Quote the exact wording, preserving capitalization, punctuation, and language. Specify hierarchy and placement; do not translate, rewrite, or add copy unless requested.
- **Local edits:** Keep preservation requirements compatible with the change. When replacing a background, preserve the subject's outline, colors, and position without also requiring the background to remain unchanged.
- **Character consistency:** Specify the facial features, hairstyle, body shape, or clothing to preserve. When the user requests a new pose, do not lock the original pose.
- **Transparent assets:** Describe the complete subject, clear edges, and a `clean background`, and state the transparent-background goal. Do not substitute a drawn checkerboard or white background for transparency.
- **Charts and educational diagrams:** Use supplied or confirmed text, values, and relationships. Resolve missing essential content instead of inventing data or sources to fill the image.
- **Iteration:** State the current adjustment and repeat constraints that still apply, so unrelated details remain consistent.

## Examples

### Generate a product image

```text
Intended use: A wide hero image for a coffee product page
Primary request: A simple product photograph of a ceramic coffee mug
Scene and background: A clean, light-colored studio background
Style and medium: Photorealistic product photography
Composition and viewpoint: Show the entire mug and leave usable negative space for page copy
Lighting and materials: Soft studio lighting with natural reflections on the ceramic glaze
Avoid: Text, logos, watermarks, and extra props
```

### Replace only the background

```text
Input images: Image 1 is the product photo to edit
Primary request: Replace the background with a warm sunset gradient
Change only: The background area
Preserve: Product shape, edges, label text, colors, size, and position in the frame
Avoid: Adding text or props, or changing the product's appearance
```

## Further prompt references

- For details on text, composition, references, and edit constraints, read [Prompting guidelines](references/prompting.md).
- For complete examples by scenario, read [Sample prompts](references/sample-prompts.md) and use only the parts relevant to the current request.
