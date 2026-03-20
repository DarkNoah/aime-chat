import {
  AutoModel,
  AutoTokenizer,
  AutoProcessor,
  PreTrainedTokenizer,
  Processor,
  RawImage,
  Tensor,
  env,
} from "@huggingface/transformers";
import { ClipModel } from "../providers/base-provider";

export interface EncodeTextOptions {
  template?: string;
}

export class ChineseCLIP implements ClipModel {
  readonly provider: string = 'local';
  readonly modelId: string = 'chinese-clip-vit-large-patch14-336px';
  private model: Awaited<ReturnType<typeof AutoModel.from_pretrained>> | null = null;
  private tokenizer: PreTrainedTokenizer | null = null;
  private processor: Processor | null = null;
  private modelName: string;

  constructor() {
  } 0.
  2.//

  /**
   * 手动加载模型、tokenizer 和 processor
   */
  async loadModel(modelPath: string): Promise<{ model: Awaited<ReturnType<typeof AutoModel.from_pretrained>>, tokenizer: PreTrainedTokenizer, processor: Processor }> {

    const [tokenizer, processor, model] = await Promise.all([
      AutoTokenizer.from_pretrained(modelPath),
      AutoProcessor.from_pretrained(modelPath),
      AutoModel.from_pretrained(modelPath),
    ]);

    this.tokenizer = tokenizer;
    this.processor = processor;
    this.model = model;

    console.log("模型加载完成!");
    return {
      model,
      tokenizer,
      processor,
    };
  }

  /**
   * 将文本编码为向量
   * @param text 输入文本
   * @returns 归一化的文本向量 (Float32Array)
   */
  async encodeText(text: string, options: EncodeTextOptions = {}): Promise<Float32Array> {
    const [vector] = await this.encodeTexts([text], options);
    return vector;
  }

  async encodeTexts(texts: string[], options: EncodeTextOptions = {}): Promise<Float32Array[]> {
    if (!this.model || !this.tokenizer) {
      throw new Error("模型未加载，请先调用 loadModel()");
    }

    const normalizedTexts = texts.map(text => this.applyTemplate(text, options.template));
    const inputs = this.tokenizer(normalizedTexts, {
      padding: true,
      truncation: true,
    });

    const imageSize = this.getImageSize();
    const batchSize = this.getBatchSize(inputs.input_ids.dims);
    const pixel_values = new Tensor(
      "float32",
      new Float32Array(batchSize * 3 * imageSize * imageSize),
      [batchSize, 3, imageSize, imageSize],
    );
    const output = await this.model({ ...inputs, pixel_values });
    const textEmbeds = (output.text_embeds ?? output.l2norm_text_embeddings ?? output.text_embeddings)?.data as Float32Array;
    return this.splitEmbeddings(this.normalizeAll(textEmbeds, batchSize), batchSize);
  }

  /**
   * 将图片编码为向量
   * @param imagePath 图片路径或 URL
   * @returns 归一化的图片向量 (Float32Array)
   */
  async encodeImage(imagePath: string): Promise<Float32Array> {
    const [vector] = await this.encodeImages([imagePath]);
    return vector;
  }

  async encodeImages(imagePaths: string[]): Promise<Float32Array[]> {
    if (!this.model || !this.processor) {
      throw new Error("模型未加载，请先调用 loadModel()");
    }

    const images = await Promise.all(imagePaths.map(imagePath => RawImage.read(imagePath)));
    const imageInputs = await this.processor(images);
    const batchSize = imageInputs.pixel_values.dims[0];
    const input_ids = new Tensor("int64", new BigInt64Array(batchSize), [batchSize, 1]);
    const attention_mask = new Tensor("int64", new BigInt64Array(batchSize).fill(1n), [batchSize, 1]);
    const output = await this.model({ ...imageInputs, input_ids, attention_mask });
    const imageEmbeds = (output.image_embeds ?? output.l2norm_image_embeddings ?? output.image_embeddings)?.data as Float32Array;
    return this.splitEmbeddings(this.normalizeAll(imageEmbeds, batchSize), batchSize);
  }

  /**
   * 计算两个向量的余弦相似度
   * @param vec1 向量1
   * @param vec2 向量2
   * @returns 相似度分数 (-1 到 1)
   */
  cosineSimilarity(textVec: Float32Array, imageVec: Float32Array): number {
    if (textVec.length !== imageVec.length) {
      throw new Error("向量维度不匹配");
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < textVec.length; i++) {
      dotProduct += textVec[i] * imageVec[i];
      norm1 += textVec[i] * textVec[i];
      norm2 += imageVec[i] * imageVec[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 向量归一化 (L2 normalization)
   */
  private normalize(vec: Float32Array): Float32Array {
    let sum = 0;
    for (let i = 0; i < vec.length; i++) {
      sum += vec[i] * vec[i];
    }
    const norm = Math.sqrt(sum);

    const normalized = new Float32Array(vec.length);
    for (let i = 0; i < vec.length; i++) {
      normalized[i] = vec[i] / norm;
    }
    return normalized;
  }

  private normalizeAll(flat: Float32Array, batchSize: number): Float32Array {
    if (batchSize <= 1) {
      return this.normalize(flat);
    }

    const dim = flat.length / batchSize;
    const normalized = new Float32Array(flat.length);

    for (let batchIndex = 0; batchIndex < batchSize; batchIndex++) {
      const start = batchIndex * dim;
      const slice = flat.subarray(start, start + dim);
      normalized.set(this.normalize(slice), start);
    }

    return normalized;
  }

  private splitEmbeddings(flat: Float32Array, batchSize: number): Float32Array[] {
    const dim = flat.length / batchSize;
    return Array.from({ length: batchSize }, (_, index) => {
      const start = index * dim;
      return flat.slice(start, start + dim);
    });
  }

  /**
   * 获取向量维度
   */
  getEmbeddingDimension(): number | null {
    return 768;
  }

  private getImageSize(): number {
    if (!this.model) {
      return 336;
    }

    const config = (this.model as { config?: { vision_config?: { image_size?: number } } }).config;
    return config?.vision_config?.image_size ?? 336;
  }

  private getBatchSize(dims: readonly number[]): number {
    return dims[0] ?? 1;
  }

  private applyTemplate(text: string, template?: string): string {
    if (!template) {
      return text;
    }

    return template.includes("{}") ? template.replace("{}", text) : template + text;
  }
}
