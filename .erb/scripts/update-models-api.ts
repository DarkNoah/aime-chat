import fs from 'fs';
import path from 'path';

const MODELS_API_URL = 'https://models.dev/api.json';
const OUTPUT_PATH = path.resolve(__dirname, '../../assets/models.json');

async function downloadModelsApiJson(): Promise<void> {
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    const res = await fetch(MODELS_API_URL, { redirect: 'follow' });
    if (!res.ok) {
      throw new Error(
        `Request failed with status ${res.status} ${res.statusText}`,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const json = JSON.parse(buffer.toString('utf-8'));

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(json, null, 2));
    // Keep console output minimal and useful for CI/logs
    console.log(`Saved models API to: ${OUTPUT_PATH}`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error while downloading models api';
    console.error(`Failed to download ${MODELS_API_URL}: ${message}`);
    process.exitCode = 1;
  }
}

// Wrap in IIFE to avoid top-level await for broader Node compatibility
(async () => {
  await downloadModelsApiJson();
})();
