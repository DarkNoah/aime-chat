/* eslint-disable react/no-unknown-property */
import React, { Suspense, useMemo, useState, useCallback } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Center, useGLTF, useFBX } from '@react-three/drei';
import * as THREE from 'three';
import {
  IconAlertCircle,
  IconArrowsMaximize,
  IconArrowsMinimize,
} from '@tabler/icons-react';
// @ts-expect-error three/examples loaders lack type declarations in this setup
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
// @ts-expect-error three/examples loaders lack type declarations in this setup
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

const SUPPORTED_EXTENSIONS = ['.glb', '.gltf', '.fbx', '.obj', '.stl'] as const;

type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback: React.ComponentType<{ error: Error }>;
  resetKey: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

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

function getErrorMessage(error: Error) {
  return error.message || 'Unknown model loading error';
}

function ModelErrorState({ error }: { error: Error }) {
  return (
    <div className="flex size-full items-center justify-center p-6 text-white">
      <div className="max-w-md rounded-xl border border-white/10 bg-black/25 p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-red-200">
          <IconAlertCircle size={18} />
          Model preview failed
        </div>
        <p className="text-sm text-white/80">
          The model file could not be loaded.
        </p>
        <p className="mt-3 wrap-break-word rounded-lg bg-black/30 px-3 py-2 font-mono text-xs text-white/70">
          {getErrorMessage(error)}
        </p>
      </div>
    </div>
  );
}

class ModelErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetKey } = this.props;
    const { error } = this.state;

    if (prevProps.resetKey !== resetKey && error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { children, fallback: Fallback } = this.props;
    const { error } = this.state;

    if (error) {
      return <Fallback error={error} />;
    }

    return children;
  }
}

function ModelScene({ url, ext }: { url: string; ext: string }) {
  return (
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
  );
}

function ModelViewport({ url, ext }: { url: string; ext: string }) {
  return (
    <ModelErrorBoundary resetKey={`${ext}:${url}`} fallback={ModelErrorState}>
      <ModelScene url={url} ext={ext} />
    </ModelErrorBoundary>
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
            className="relative h-[85vh] w-[90vw]"
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
              className="size-full overflow-hidden rounded-xl"
              style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              }}
            >
              <ModelViewport url={url} ext={ext} />
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
        <ModelViewport url={url} ext={ext} />
      </div>
    </>
  );
}
