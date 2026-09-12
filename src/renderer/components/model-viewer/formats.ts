const SUPPORTED_EXTENSIONS = ['.glb', '.gltf', '.fbx', '.obj', '.stl'] as const;

type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export function isSupportedModelFile(ext?: string): boolean {
  if (!ext) return false;
  const normalized = ext.toLowerCase().startsWith('.')
    ? ext.toLowerCase()
    : `.${ext.toLowerCase()}`;
  return SUPPORTED_EXTENSIONS.includes(normalized as SupportedExtension);
}
