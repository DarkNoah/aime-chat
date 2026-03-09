import BaseToolkit, { BaseToolkitParams } from "../base-toolkit";
import { EditImage } from "./edit-image";
import { GenerateImage } from "./generate-image";
import { RemoveBackground } from "./rmbg";

export class ImageToolkit extends BaseToolkit {
  static readonly toolName = 'ImageToolkit';
  id: string = 'ImageToolkit';
  description = 'Image toolkit for generating, editing, and analyzing images.';

  constructor(params?: BaseToolkitParams) {
    const editConfig = params?.[EditImage.toolName];
    const generateConfig = params?.[GenerateImage.toolName];
    const removeBackgroundConfig = params?.[RemoveBackground.toolName];
    super(
      [new EditImage(editConfig), new GenerateImage(generateConfig), new RemoveBackground(removeBackgroundConfig)],
      params,
    );
  }

  getTools() {
    return this.tools;
  }
}
