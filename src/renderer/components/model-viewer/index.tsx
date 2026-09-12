/* eslint-disable react/no-unknown-property */
import React, {
  Suspense,
  useMemo,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import {
  OrbitControls,
  Center,
  Environment,
  Lightformer,
  useGLTF,
  useFBX,
} from '@react-three/drei';
import * as THREE from 'three';
import { useTranslation } from 'react-i18next';
import {
  IconAlertCircle,
  IconArrowsMaximize,
  IconArrowsMinimize,
  Icon3dCubeSphere,
} from '@tabler/icons-react';
// @ts-expect-error three/examples loaders lack type declarations in this setup
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
// @ts-expect-error three/examples loaders lack type declarations in this setup
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { applyModelWireframe } from './wireframe';

export { isSupportedModelFile } from './formats';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback: React.ComponentType<{ error: Error }>;
  resetKey: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

type ModelSourceProps = { url: string; wireframe: boolean };

// Loader objects are cached and shared by inline and expanded previews.
// Wireframe materials belong to each preview; cached assets stay intact.
function ModelObject({
  object,
  wireframe,
}: {
  object: THREE.Object3D;
  wireframe: boolean;
}) {
  const instance = useMemo(() => object.clone(), [object]);

  useLayoutEffect(() => {
    if (!wireframe) return undefined;
    return applyModelWireframe(instance);
  }, [instance, wireframe]);

  return <primitive object={instance} />;
}

function GLTFModel({ url, wireframe }: ModelSourceProps) {
  const { scene } = useGLTF(url);
  return <ModelObject object={scene} wireframe={wireframe} />;
}

function FBXModel({ url, wireframe }: ModelSourceProps) {
  const fbx = useFBX(url);
  return <ModelObject object={fbx} wireframe={wireframe} />;
}

function OBJModel({ url, wireframe }: ModelSourceProps) {
  const obj = useLoader(OBJLoader, url);
  return <ModelObject object={obj} wireframe={wireframe} />;
}

function STLModel({ url, wireframe }: ModelSourceProps) {
  const geometry = useLoader(STLLoader, url);
  return (
    <mesh geometry={geometry}>
      {wireframe ? (
        <meshBasicMaterial color="#e2e8f0" wireframe toneMapped={false} />
      ) : (
        <meshStandardMaterial color="#8899aa" metalness={0.3} roughness={0.6} />
      )}
    </mesh>
  );
}

function ModelContent({
  url,
  ext,
  wireframe,
}: ModelSourceProps & { ext: string }) {
  const normalized = ext.toLowerCase().startsWith('.')
    ? ext.toLowerCase()
    : `.${ext.toLowerCase()}`;

  switch (normalized) {
    case '.glb':
    case '.gltf':
      return <GLTFModel url={url} wireframe={wireframe} />;
    case '.fbx':
      return <FBXModel url={url} wireframe={wireframe} />;
    case '.obj':
      return <OBJModel url={url} wireframe={wireframe} />;
    case '.stl':
      return <STLModel url={url} wireframe={wireframe} />;
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

function ModelScene({
  url,
  ext,
  wireframe,
}: ModelSourceProps & { ext: string }) {
  return (
    <Canvas
      camera={{ position: [0, 2, 5], fov: 45 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={2} />
      <directionalLight position={[-5, 2, -5]} intensity={1} />
      <hemisphereLight args={['#ffffff', '#c4c9d1', 1]} />
      {/* Local studio reflections for PBR materials, with no remote HDR download. */}
      <Environment resolution={128} frames={1}>
        <mesh scale={10}>
          <sphereGeometry args={[1, 32, 16]} />
          <meshBasicMaterial color="#bfc5cc" side={THREE.BackSide} />
        </mesh>
        <Lightformer
          intensity={3}
          position={[0, 5, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[8, 8, 1]}
        />
        <Lightformer
          intensity={2}
          position={[-5, 1, 0]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[4, 6, 1]}
        />
      </Environment>
      <Suspense fallback={<LoadingFallback />}>
        <Center>
          <ModelContent url={url} ext={ext} wireframe={wireframe} />
        </Center>
      </Suspense>
      <OrbitControls makeDefault enableDamping />
    </Canvas>
  );
}

function ModelViewport({
  url,
  ext,
  wireframe,
}: ModelSourceProps & { ext: string }) {
  return (
    <ModelErrorBoundary resetKey={`${ext}:${url}`} fallback={ModelErrorState}>
      <ModelScene url={url} ext={ext} wireframe={wireframe} />
    </ModelErrorBoundary>
  );
}

function PreviewControls({
  maximized,
  wireframe,
  onToggleMaximize,
  onToggleWireframe,
}: {
  maximized: boolean;
  wireframe: boolean;
  onToggleMaximize: () => void;
  onToggleWireframe: () => void;
}) {
  const { t } = useTranslation();
  const wireframeLabel = t(
    wireframe ? 'model_viewer.hide_wireframe' : 'model_viewer.show_wireframe',
  );
  const maximizeLabel = t(
    maximized ? 'model_viewer.minimize' : 'model_viewer.maximize',
  );
  const buttonClass =
    'inline-flex size-8 items-center justify-center rounded-lg bg-black/50 text-white aria-pressed:bg-white aria-pressed:text-slate-900 aria-pressed:ring-2 aria-pressed:ring-white/50 transition-colors hover:bg-black/70 aria-pressed:hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none';
  return (
    <div className="absolute top-2 right-2 z-10 flex gap-1.5">
      <button
        type="button"
        className={buttonClass}
        onClick={onToggleWireframe}
        aria-label={wireframeLabel}
        title={wireframeLabel}
        aria-pressed={wireframe}
      >
        <Icon3dCubeSphere size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={onToggleMaximize}
        aria-label={maximizeLabel}
        title={maximizeLabel}
      >
        {maximized ? (
          <IconArrowsMinimize size={18} aria-hidden="true" />
        ) : (
          <IconArrowsMaximize size={18} aria-hidden="true" />
        )}
      </button>
    </div>
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
  const [wireframe, setWireframe] = useState(false);
  const toggleWireframe = useCallback(() => setWireframe((v) => !v), []);
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
            <PreviewControls
              maximized
              wireframe={wireframe}
              onToggleMaximize={toggleMaximize}
              onToggleWireframe={toggleWireframe}
            />
            <div
              className="size-full overflow-hidden rounded-xl"
              style={{
                background: '#424852',
              }}
            >
              <ModelViewport url={url} ext={ext} wireframe={wireframe} />
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
          background: '#424852',
          ...style,
        }}
      >
        <PreviewControls
          maximized={false}
          wireframe={wireframe}
          onToggleMaximize={toggleMaximize}
          onToggleWireframe={toggleWireframe}
        />
        <ModelViewport url={url} ext={ext} wireframe={wireframe} />
      </div>
    </>
  );
}
