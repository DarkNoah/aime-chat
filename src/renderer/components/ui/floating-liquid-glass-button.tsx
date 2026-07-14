import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/renderer/lib/utils';
import { Button } from '@/renderer/components/ui/button';

const EDGE_GAP = 12;
const BUTTON_GAP = 8;
const DRAG_THRESHOLD = 4;

type Edge = 'top' | 'right' | 'bottom' | 'left';
type Position = { x: number; y: number };

const floatingButtons = new Map<string, HTMLButtonElement>();

export type FloatingLiquidGlassTone = 'active' | 'danger' | 'success';

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  origin: Position;
  moved: boolean;
};

type FloatingLiquidGlassButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  | 'onClick'
  | 'onPointerDown'
  | 'onPointerMove'
  | 'onPointerUp'
  | 'onPointerCancel'
  | 'style'
> & {
  floatingId: string;
  initialBottom: number;
  initialLeft?: number;
  tone: FloatingLiquidGlassTone;
  onActivate: () => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function clampToViewport(position: Position, rect: DOMRect): Position {
  return {
    x: clamp(position.x, EDGE_GAP, window.innerWidth - rect.width - EDGE_GAP),
    y: clamp(position.y, EDGE_GAP, window.innerHeight - rect.height - EDGE_GAP),
  };
}

function findNearestEdge(position: Position, rect: DOMRect): Edge {
  const distances: Array<[Edge, number]> = [
    ['left', position.x],
    ['right', window.innerWidth - position.x - rect.width],
    ['top', position.y],
    ['bottom', window.innerHeight - position.y - rect.height],
  ];

  return distances.reduce((nearest, candidate) =>
    candidate[1] < nearest[1] ? candidate : nearest,
  )[0];
}

function snapToEdge(position: Position, rect: DOMRect, edge: Edge): Position {
  const clamped = clampToViewport(position, rect);

  if (edge === 'left') return { ...clamped, x: EDGE_GAP };
  if (edge === 'right') {
    return { ...clamped, x: window.innerWidth - rect.width - EDGE_GAP };
  }
  if (edge === 'top') return { ...clamped, y: EDGE_GAP };
  return { ...clamped, y: window.innerHeight - rect.height - EDGE_GAP };
}

function getPeerRects(floatingId: string) {
  return Array.from(floatingButtons.entries())
    .filter(([id, element]) => id !== floatingId && element.isConnected)
    .map(([, element]) => element.getBoundingClientRect());
}

function rectAt(position: Position, rect: DOMRect) {
  return {
    bottom: position.y + rect.height,
    left: position.x,
    right: position.x + rect.width,
    top: position.y,
  };
}

function overlapsWithGap(candidate: ReturnType<typeof rectAt>, peer: DOMRect) {
  return (
    candidate.left < peer.right + BUTTON_GAP &&
    candidate.right > peer.left - BUTTON_GAP &&
    candidate.top < peer.bottom + BUTTON_GAP &&
    candidate.bottom > peer.top - BUTTON_GAP
  );
}

function avoidPeerOverlap(
  position: Position,
  rect: DOMRect,
  edge: Edge,
  peerRects: DOMRect[],
): Position {
  if (peerRects.length === 0) return position;

  const isVerticalEdge = edge === 'left' || edge === 'right';
  const desired = isVerticalEdge ? position.y : position.x;
  const size = isVerticalEdge ? rect.height : rect.width;
  const viewportSize = isVerticalEdge ? window.innerHeight : window.innerWidth;
  const max = Math.max(EDGE_GAP, viewportSize - size - EDGE_GAP);
  const candidates = [desired, EDGE_GAP, max];

  peerRects.forEach((peer) => {
    const start = isVerticalEdge ? peer.top : peer.left;
    const end = isVerticalEdge ? peer.bottom : peer.right;
    candidates.push(start - size - BUTTON_GAP, end + BUTTON_GAP);
  });

  const orderedCandidates = Array.from(
    new Set(candidates.map((candidate) => clamp(candidate, EDGE_GAP, max))),
  ).sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired));

  for (const candidate of orderedCandidates) {
    const next = isVerticalEdge
      ? { ...position, y: candidate }
      : { ...position, x: candidate };
    const nextRect = rectAt(next, rect);
    if (peerRects.every((peer) => !overlapsWithGap(nextRect, peer))) {
      return next;
    }
  }

  return position;
}

export function FloatingLiquidGlassButton({
  children,
  className,
  floatingId,
  initialBottom,
  initialLeft = 16,
  onActivate,
  tone,
  ...props
}: FloatingLiquidGlassButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const positionRef = useRef<Position | null>(null);
  const snappedEdgeRef = useRef<Edge | null>(null);
  const suppressClickRef = useRef(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const updatePosition = useCallback((nextPosition: Position) => {
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }, []);

  const snapCurrentPosition = useCallback(() => {
    const button = buttonRef.current;
    const { current } = positionRef;
    if (!button || !current) return;

    const rect = button.getBoundingClientRect();
    const edge = findNearestEdge(current, rect);
    snappedEdgeRef.current = edge;
    const snapped = snapToEdge(current, rect, edge);
    updatePosition(
      avoidPeerOverlap(snapped, rect, edge, getPeerRects(floatingId)),
    );
  }, [floatingId, updatePosition]);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return undefined;

    floatingButtons.set(floatingId, button);
    return () => {
      if (floatingButtons.get(floatingId) === button) {
        floatingButtons.delete(floatingId);
      }
    };
  }, [floatingId]);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return undefined;

    const keepInsideWindow = () => {
      const { current } = positionRef;
      if (!current) return;

      const rect = button.getBoundingClientRect();
      const edge = snappedEdgeRef.current;
      if (!edge) {
        updatePosition(clampToViewport(current, rect));
        return;
      }

      const snapped = snapToEdge(current, rect, edge);
      updatePosition(
        avoidPeerOverlap(snapped, rect, edge, getPeerRects(floatingId)),
      );
    };

    window.addEventListener('resize', keepInsideWindow);
    const observer = new ResizeObserver(keepInsideWindow);
    observer.observe(button);

    return () => {
      window.removeEventListener('resize', keepInsideWindow);
      observer.disconnect();
    };
  }, [floatingId, updatePosition]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const origin = { x: rect.left, y: rect.top };
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) {
      return;
    }

    drag.moved = true;
    setIsDragging(true);
    snappedEdgeRef.current = null;
    event.preventDefault();
    updatePosition(
      clampToViewport(
        { x: drag.origin.x + deltaX, y: drag.origin.y + deltaY },
        event.currentTarget.getBoundingClientRect(),
      ),
    );
  };

  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (drag.moved) {
      suppressClickRef.current = true;
      snapCurrentPosition();
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    dragRef.current = null;
    setIsDragging(false);
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onActivate();
  };

  return (
    <Button
      ref={buttonRef}
      variant="outline"
      size="sm"
      data-dragging={isDragging}
      className={cn(
        'group fixed z-50 isolate h-11 max-w-[220px] touch-none select-none gap-0 overflow-hidden rounded-full px-2.5 pr-4 text-xs',
        'cursor-grab border-white/60 bg-white/[0.08] text-foreground backdrop-blur-[1px] backdrop-saturate-[1.8] backdrop-contrast-[1.12] active:cursor-grabbing',
        'shadow-[0_3px_8px_rgba(15,23,42,0.24),inset_0_1px_0_rgba(255,255,255,0.94),inset_0_-1px_0_rgba(244,114,182,0.50),inset_1px_0_0_rgba(34,211,238,0.58),inset_-1px_0_0_rgba(96,165,250,0.42)]',
        'transition-[left,top,transform,background-color,border-color,box-shadow,backdrop-filter] duration-200 ease-out',
        'hover:border-white/80 hover:bg-white/[0.12] hover:backdrop-saturate-[2] hover:shadow-[0_4px_8px_rgba(15,23,42,0.27),inset_0_1px_0_rgba(255,255,255,1),inset_0_-1px_0_rgba(244,114,182,0.62),inset_1px_0_0_rgba(34,211,238,0.72),inset_-1px_0_0_rgba(96,165,250,0.52)]',
        'active:scale-[0.97] active:bg-white/[0.15] active:shadow-[0_1px_5px_rgba(15,23,42,0.20),inset_0_1px_0_rgba(255,255,255,0.82),inset_0_-1px_0_rgba(244,114,182,0.44),inset_1px_0_0_rgba(34,211,238,0.50)]',
        'focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2',
        'data-[dragging=true]:scale-100 data-[dragging=true]:cursor-grabbing data-[dragging=true]:transition-none',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
        'dark:border-white/35 dark:bg-white/[0.055] dark:hover:border-white/55 dark:hover:bg-white/10 dark:active:bg-white/[0.13]',
        '[@media(prefers-reduced-transparency:reduce)]:bg-background/95 [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none',
        tone === 'active' && 'border-primary/35 dark:border-primary/35',
        tone === 'danger' && 'border-destructive/35 dark:border-destructive/35',
        className,
      )}
      style={
        position
          ? { left: position.x, top: position.y }
          : { bottom: initialBottom, left: initialLeft }
      }
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-px z-0 rounded-full opacity-80 mix-blend-screen transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none dark:opacity-65"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[2px] z-0 rounded-full "
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-[2px] z-0 h-px rounded-full bg-gradient-to-r from-transparent via-white/95 to-transparent shadow-[0_1px_2px_rgba(255,255,255,0.75)] dark:via-white/75"
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute -left-3 top-1/2 z-0 size-16 -translate-y-1/2 rounded-full blur-xl',
          '[@media(prefers-reduced-transparency:reduce)]:hidden',
          tone === 'active' && 'bg-primary/10',
          tone === 'danger' && 'bg-destructive/10',
          tone === 'success' && 'bg-emerald-500/10',
        )}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-4 -top-5 z-0 h-9 w-24 rotate-12 rounded-[50%] bg-white/30 opacity-45 blur-[5px] transition-opacity duration-200 group-hover:opacity-70 motion-reduce:transition-none dark:bg-white/20"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-2 left-[18%] z-0 h-3 w-[58%] rounded-full bg-gradient-to-r from-cyan-300/25 via-blue-400/10 to-rose-300/35 blur-[5px] transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
      />
      <span className="relative z-10 flex min-w-0 items-center gap-2 [text-shadow:0_1px_1px_rgba(255,255,255,0.55)] dark:[text-shadow:0_1px_1px_rgba(0,0,0,0.65)]">
        {children}
      </span>
    </Button>
  );
}

export function FloatingLiquidGlassIcon({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: FloatingLiquidGlassTone;
}) {
  return (
    <span
      className={cn(
        'relative isolate flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full',
        'border border-white/65 bg-white/10 backdrop-blur-[2px] ',
        'dark:border-white/35 dark:bg-white/[0.065]',
        tone === 'active' && 'bg-primary/[0.07] dark:bg-primary/[0.09]',
        tone === 'danger' && 'bg-destructive/[0.08]',
        tone === 'success' && 'bg-emerald-500/[0.07]',
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-px rounded-full  opacity-70 mix-blend-screen"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1.5 top-px h-px rounded-full bg-white/90"
      />
      <span className="relative z-10 flex items-center justify-center">
        {children}
      </span>
    </span>
  );
}
