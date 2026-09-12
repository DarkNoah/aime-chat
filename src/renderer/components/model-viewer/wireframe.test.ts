import * as THREE from 'three';
import { applyModelWireframe } from './wireframe';

describe('model preview wireframe', () => {
  it('handles meshes from a separate Three.js module instance', () => {
    let foreignMesh!: THREE.Mesh;
    jest.isolateModules(() => {
      const isolatedThree = jest.requireActual<typeof THREE>('three');
      foreignMesh = new isolatedThree.Mesh(
        new isolatedThree.BoxGeometry(),
        new isolatedThree.MeshStandardMaterial(),
      );
    });
    expect(foreignMesh.isMesh).toBe(true);
    expect(foreignMesh).not.toBeInstanceOf(THREE.Mesh);
    const original = foreignMesh.material;
    const restore = applyModelWireframe(foreignMesh);
    expect(foreignMesh.material).not.toBe(original);
    expect(foreignMesh.material).toMatchObject({
      isMeshBasicMaterial: true,
      wireframe: true,
    });
    restore();
    expect(foreignMesh.material).toBe(original);
  });

  it('shows opaque unlit lines independently of texture, alpha and vertex colors', () => {
    const map = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({
      map,
      alphaMap: map,
      color: '#000000',
      transparent: true,
      opacity: 0,
      alphaTest: 0.9,
      vertexColors: true,
      metalness: 1,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), source);
    const restore = applyModelWireframe(mesh);
    const wire = mesh.material as unknown as THREE.MeshBasicMaterial;

    expect(wire).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(wire.wireframe).toBe(true);
    expect(wire.map).toBeNull();
    expect(wire.alphaMap).toBeNull();
    expect(wire.opacity).toBe(1);
    expect(wire.transparent).toBe(false);
    expect(wire.alphaTest).toBe(0);
    expect(wire.vertexColors).toBe(false);
    expect(wire.toneMapped).toBe(false);
    expect(wire.side).toBe(THREE.DoubleSide);
    expect(wire.color.getHexString()).toBe('e2e8f0');

    restore();
    expect(mesh.material).toBe(source);
    expect(source.map).toBe(map);
    expect(source.opacity).toBe(0);
    expect(source.wireframe).toBe(false);
  });

  it('isolates previews sharing a cached multi-material mesh and restores exact materials', () => {
    const originals = [
      new THREE.MeshStandardMaterial(),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    ];
    const cached = new THREE.Mesh(new THREE.BoxGeometry(), originals);
    const inline = cached.clone();
    const expanded = cached.clone();
    const inlineOriginals = inline.material;
    const expandedOriginals = expanded.material;
    const originalDispose = originals.map((material) =>
      jest.spyOn(material, 'dispose'),
    );
    const restoreInline = applyModelWireframe(inline);
    const restoreExpanded = applyModelWireframe(expanded);
    const inlineMaterials = inline.material;
    const wireDispose = inlineMaterials.map((material) =>
      jest.spyOn(material, 'dispose'),
    );

    expect(cached.material).toBe(originals);
    expect(inline.material).not.toBe(expanded.material);
    restoreInline();
    expect(inline.material).toBe(inlineOriginals);
    expect(expanded.material).not.toBe(expandedOriginals);
    wireDispose.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    originalDispose.forEach((dispose) =>
      expect(dispose).not.toHaveBeenCalled(),
    );
    restoreExpanded();
    expect(expanded.material).toBe(expandedOriginals);
  });
});
