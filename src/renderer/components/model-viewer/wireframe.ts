import * as THREE from 'three';

/** Replace materials only on a preview instance, leaving loader caches intact. */
export function applyModelWireframe(object: THREE.Object3D): () => void {
  const restoreMaterials: (() => void)[] = [];
  const wireMaterials: THREE.MeshBasicMaterial[] = [];

  object.traverse((child) => {
    // Loaders can use the ESM build while the renderer imports the CJS build.
    // instanceof fails across those constructors; Three.js exposes isMesh for this.
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const original = mesh.material;
    const createWireMaterial = (source: THREE.Material) => {
      const material = new THREE.MeshBasicMaterial({
        color: '#e2e8f0',
        wireframe: true,
        side: source.side,
        toneMapped: false,
      });
      wireMaterials.push(material);
      return material;
    };
    mesh.material = Array.isArray(original)
      ? original.map(createWireMaterial)
      : createWireMaterial(original);
    restoreMaterials.push(() => {
      mesh.material = original;
    });
  });

  return () => {
    restoreMaterials.forEach((restore) => restore());
    wireMaterials.forEach((material) => material.dispose());
  };
}
