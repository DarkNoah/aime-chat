import { randomUUID } from "crypto";
import { app } from "electron";
import path from "path";
import ffmpeg from 'fluent-ffmpeg';

export async function convertToWav(inputPath: string, outputPath: string): Promise<string> {
  // const outputPath = path.join(app.getPath('temp'), `stt-${randomUUID()}.wav`);

  return new Promise<string>((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('error', (err: Error) => reject(err))
      .on('end', () => resolve(outputPath))
      .save(outputPath);
  });
}
