# Prompting Guidelines

This reference expands on composition, text, reference images, and edit constraints. For complete scenarios, see [Sample prompts](sample-prompts.md).

## Order and information density

- Start with the intended use and primary goal, then describe the scene, subject, visual details, and constraints.
- Use brief natural language for simple images. For complex images, separate requirements into short labeled lines.
- Prioritize details that affect the result. Remove repeated style terms and contradictory descriptions.
- Examples are independent creative briefs. Do not automatically add their props, palettes, or constraints to the user's request.

## Adding detail appropriately

- For specific requests, preserve the meaning and only improve organization or clarify ambiguous references.
- For broad requests, add framing, lighting, material, or intended-use details when needed.
- Do not invent people, objects, brand copy, color schemes, or story elements.
- Do not treat example constraints such as "no text" or "no logos" as universal rules. When the user requests text or a logo, describe how it should appear.

## Composition and negative space

- Specify close-up, medium, wide, top-down, or eye-level views and relative subject positions when useful.
- For web images, posters, or covers that need copy, describe the negative space. Follow the user's requirements or the existing layout for its direction.
- For people, clarify body framing, gaze, and interactions when relevant, such as "full body visible," "looking down at a book," or "hands naturally gripping the handlebars."
- For multiple subjects, describe their number, visual priority, and overlap rather than merely listing nouns.

## Lighting, materials, and style

- For realistic photos, explicitly request a photographic appearance and describe concrete textures such as skin detail, worn fabric, or wood grain.
- Describe the required light direction and quality, such as natural side lighting, soft studio light, or backlit edges.
- For illustrations and 3D concepts, specify the medium, brushwork, or surface materials. Avoid combining incompatible styles.
- For logo concepts, describe simple silhouettes, flat colors, and legibility at small sizes. These are visual requirements, not a promise of editable vector output.

## Text in images

- Quote each exact text string, preserving capitalization, punctuation, numbers, and language.
- For text replacement, explicitly map the original wording to its replacement. Do not leave the translation scope to inference.
- Specify title, subtitle, and label hierarchy, along with font style, contrast, and placement.
- Emphasize uncommon words, abbreviations, or easily confused characters when needed. Do not convert everything to uppercase unless requested.
- For dense copy, specify reading order and grouping, and avoid tiny labels. Do not remove wording merely to fit the layout.

## References and compositing

- Label images as "Image 1," "Image 2," and so on, matching their actual input order, and explain each role.
- Distinguish the edit target, character reference, style reference, composition reference, and subject to insert.
- Inherit only the requested reference features. Matching brushwork does not imply copying the people or text in the reference.
- For compositing, specify which subject from Image 2 belongs where in Image 1, including scale, perspective, light source, and contact shadows.
- For character consistency across a series, repeat the appearance constraints while allowing the scene and action to follow the current request.

## Edit scope and preservation

Suggested wording:

```text
Change only: The specified object or region
Preserve: Key details unaffected by this edit
Integration: How the edited region should match surrounding texture, lighting, or perspective
```

- Select preservation requirements for the task instead of locking every attribute. Changing the weather affects lighting and shadows, so do not also require all lighting and shadows to remain identical.
- When replacing or removing an object, describe the background texture and occluded areas that must be restored.
- For clothing changes, preserve the face, hairstyle, body shape, and pose. Fabric folds and shadows may change with the clothing.
- Repeat important preservation requirements in each iteration and introduce only the changes requested for that iteration.

## Transparent-background assets

- Describe the complete subject, a `clean background`, and a clearly separable silhouette. Minimize background clutter and unnecessary occlusion.
- Specify fine details to preserve, such as hair strands, product labels, holes, thin lines, and translucent edges.
- Transparency is the intended result. Do not ask for a checkerboard to represent it or call a solid white background transparent.
- State whether to retain cast shadows according to the intended use. Do not add a floor, pedestal, or decorative background by default.

## Priorities by scenario

| Scenario | Details to prioritize |
| --- | --- |
| Photorealistic photography | Framing, natural light, real textures, and subject actions |
| Product display | Product shape, materials, labels, and relationship to the background |
| UI mockups | Device orientation, layout, information hierarchy, and exact copy |
| Infographics and educational diagrams | Confirmed relationships, labels, arrow directions, and reading order |
| Advertising and posters | Audience, subject, brand requirements, and exact copy |
| Comics and narrative illustrations | Panel count, actions in each panel, and character consistency |
| Game assets | Viewpoint, silhouette readability, consistent style, or texture seams |
| Historical scenes | Established period, location, clothing, and environmental details |
| Sketch-to-render | Original layout, proportions, perspective, and intended materials |
