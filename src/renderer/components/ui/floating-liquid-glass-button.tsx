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
        'fixed z-50 h-11 max-w-[220px] touch-none select-none gap-0 rounded-full px-2.5 pr-4 text-xs',
        'cursor-grab border-border bg-background/95 text-foreground shadow-md active:cursor-grabbing dark:border-border dark:bg-background/95',
        'transition-[left,top,transform,background-color] duration-150 ease-out hover:bg-accent active:scale-[0.98] dark:hover:bg-accent',
        'focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2',
        'data-[dragging=true]:scale-100 data-[dragging=true]:cursor-grabbing data-[dragging=true]:transition-none',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
        tone === 'active' && 'border-primary/40 dark:border-primary/40',
        tone === 'danger' && 'border-destructive/40 dark:border-destructive/40',
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
      <span className="flex min-w-0 items-center gap-2">{children}</span>
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
        'flex size-7 shrink-0 items-center justify-center rounded-full bg-muted',
        tone === 'active' && 'bg-primary/10',
        tone === 'danger' && 'bg-destructive/10',
        tone === 'success' && 'bg-emerald-500/10',
      )}
    >
      {children}
    </span>
  );
}
