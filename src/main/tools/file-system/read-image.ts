import sharp from 'sharp';

export const MAX_READ_IMAGE_PIXELS = 8_294_400;

/** Bound only the image bytes returned to the model, leaving the source intact. */
export async function resizeReadImageData(
  data: string,
  mediaType: string,
): Promise<{ data: string; mediaType: string }> {
  const image = sharp(Buffer.from(data, 'base64'));
  const metadata = await image.metadata();
  const { width, height } = metadata.autoOrient;

  if (width * height <= MAX_READ_IMAGE_PIXELS) {
    return { data, mediaType };
  }

  const scale = Math.sqrt(MAX_READ_IMAGE_PIXELS / width / height);
  // The single-pixel minimum also needs a cap for extremely narrow images.
  const targetWidth = Math.min(
    MAX_READ_IMAGE_PIXELS,
    Math.max(1, Math.floor(width * scale)),
  );
  const targetHeight = Math.min(
    MAX_READ_IMAGE_PIXELS,
    Math.max(1, Math.floor(height * scale)),
  );
  const resized = await image
    .autoOrient()
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  return { data: resized.toString('base64'), mediaType: 'image/png' };
}
