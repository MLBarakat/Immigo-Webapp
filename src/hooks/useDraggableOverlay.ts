import { useEffect, useRef, useState } from 'react';
import type { PointerEventHandler, RefObject } from 'react';

interface DragOffset {
  x: number;
  y: number;
}

interface ActiveDrag {
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: DragOffset;
  startLeft: number;
  startTop: number;
  width: number;
  height: number;
}

interface DraggableOverlay<T extends HTMLElement> {
  overlayRef: RefObject<T>;
  handlePointerDown: PointerEventHandler<T>;
  handlePointerMove: PointerEventHandler<T>;
  handlePointerUp: PointerEventHandler<T>;
}

export function useDraggableOverlay<T extends HTMLElement>(targetRef?: RefObject<T>): DraggableOverlay<T> {
  const internalRef = useRef<T>(null);
  const overlayRef = targetRef ?? internalRef;
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const [offset, setOffset] = useState<DragOffset>({ x: 0, y: 0 });
  const offsetRef = useRef(offset);

  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.style.translate = `${offset.x}px ${offset.y}px`;
    }
  }, [offset, overlayRef]);

  const handlePointerDown: PointerEventHandler<T> = (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea')) return;

    const overlay = overlayRef.current;
    if (!overlay) return;

    const rect = overlay.getBoundingClientRect();
    activeDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offsetRef.current,
      startLeft: rect.left,
      startTop: rect.top,
      width: rect.width,
      height: rect.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove: PointerEventHandler<T> = (event) => {
    const drag = activeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const left = drag.startLeft + deltaX;
    const top = drag.startTop + deltaY;
    const minPosition = 8;
    const maxLeft = Math.max(minPosition, window.innerWidth - drag.width - minPosition);
    const maxTop = Math.max(minPosition, window.innerHeight - drag.height - minPosition);
    const boundedLeft = Math.min(maxLeft, Math.max(minPosition, left));
    const boundedTop = Math.min(maxTop, Math.max(minPosition, top));

    const nextOffset = {
      x: drag.startOffset.x + boundedLeft - drag.startLeft,
      y: drag.startOffset.y + boundedTop - drag.startTop,
    };
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  };

  const handlePointerUp: PointerEventHandler<T> = (event) => {
    if (activeDragRef.current?.pointerId !== event.pointerId) return;
    activeDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return { overlayRef, handlePointerDown, handlePointerMove, handlePointerUp };
}
