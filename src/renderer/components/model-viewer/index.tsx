/* eslint-disable react/no-unknown-property */
import React, { Suspense, useMemo, useState, useCallback } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Center, useGLTF, useFBX } from '@react-three/drei';
import * as THREE from 'three';
import { IconArrowsMaximize, IconArrowsMinimize } from '@tabler/icons-react';
// @ts-expect-error three/examples loaders lack type declarations in this setup
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
// @ts-expect-error three/examples loaders lack type declarations in this setup
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

const SUPPORTED_EXTENSIONS = ['.glb', '.gltf', '.fbx', '.obj', '.stl'] as const;

type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export function isSupportedModelFile(ext?: string): boolean {
  if (!ext) return false;
  const normalized = ext.toLowerCase().startsWith('.')
    ? ext.toLowerCase()
    : `.${ext.toLowerCase()}`;
  return SUPPORTED_EXTENSIONS.includes(normalized as SupportedExtension);
}

function GLTFModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene.clone()} />;
}

function FBXModel({ url }: { url: string }) {
  const fbx = useFBX(url);
  return <primitive object={fbx.clone()} />;
}

function OBJModel({ url }: { url: string }) {
  const obj = useLoader(OBJLoader, url);
  return <primitive object={obj.clone()} />;
}

function STLModel({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#8899aa',
        metalness: 0.3,
        roughness: 0.6,
      }),
    [],
  );
  return <mesh geometry={geometry} material={material} />;
}

function ModelContent({ url, ext }: { url: string; ext: string }) {
  const normalized = ext.toLowerCase().startsWith('.')
    ? ext.toLowerCase()
    : `.${ext.toLowerCase()}`;

  switch (normalized) {
    case '.glb':
    case '.gltf':
      return <GLTFModel url={url} />;
    case '.fbx':
      return <FBXModel url={url} />;
    case '.obj':
      return <OBJModel url={url} />;
    case '.stl':
      return <STLModel url={url} />;
    default:
      return null;
  }
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#666" wireframe />
    </mesh>
  );
}

export interface ModelViewerProps {
  url: string;
  ext: string;
  className?: string;
  style?: React.CSSProperties;
}

export function ModelViewer({ url, ext, className, style }: ModelViewerProps) {
  const [maximized, setMaximized] = useState(false);
  const toggleMaximize = useCallback(() => setMaximized((v) => !v), []);

  return (
    <>
      {maximized && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={toggleMaximize}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Escape' && setMaximized(false)}
        >
          <div
            className="relative w-[90vw] h-[85vh]"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <button
              type="button"
              className="absolute top-3 right-3 z-10 rounded-lg bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
              onClick={toggleMaximize}
            >
              <IconArrowsMinimize size={18} />
            </button>
            <div
              className="size-full rounded-xl overflow-hidden"
              style={{
                background:
                  'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              }}
            >
              <Canvas
                camera={{ position: [0, 2, 5], fov: 45 }}
                gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
              >
                <ambientLight intensity={0.6} />
                <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
                <directionalLight position={[-5, -2, -5]} intensity={0.4} />
                <hemisphereLight args={['#b1e1ff', '#b97a20', 0.5]} />
                <Suspense fallback={<LoadingFallback />}>
                  <Center>
                    <ModelContent url={url} ext={ext} />
                  </Center>
                </Suspense>
                <OrbitControls makeDefault enableDamping />
              </Canvas>
            </div>
          </div>
        </div>
      )}
      <div
        className={`relative ${className ?? ''}`}
        style={{
          width: '100%',
          height: 300,
          borderRadius: 12,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
          ...style,
        }}
      >
        <button
          type="button"
          className="absolute top-2 right-2 z-10 rounded-lg bg-white/10 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          onClick={toggleMaximize}
        >
          <IconArrowsMaximize size={16} />
        </button>
        <Canvas
          camera={{ position: [0, 2, 5], fov: 45 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
          <directionalLight position={[-5, -2, -5]} intensity={0.4} />
          <hemisphereLight args={['#b1e1ff', '#b97a20', 0.5]} />
          <Suspense fallback={<LoadingFallback />}>
            <Center>
              <ModelContent url={url} ext={ext} />
            </Center>
          </Suspense>
          <OrbitControls makeDefault enableDamping />
        </Canvas>
      </div>
    </>
  );
}
