import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './PosterModal.module.css';

interface PosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  posterUrl: string;
  title: string;
}

const PosterModal: React.FC<PosterModalProps> = ({ isOpen, onClose, posterUrl, title }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const lastPointerPositionRef = useRef({ x: 0, y: 0 });
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialPinchScaleRef = useRef(1);
  const scaleRef = useRef(scale);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isMounted, isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      scaleRef.current = 1;
      activePointersRef.current.clear();
      initialPinchDistanceRef.current = null;
      initialPinchScaleRef.current = 1;
      isDraggingRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  const clampScale = (value: number) => Math.min(4, Math.max(1, value));

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    setScale((prevScale) => {
      const nextScale = clampScale(prevScale - event.deltaY * 0.0015);
      const clampedScale = Number(nextScale.toFixed(3));

      if (clampedScale === 1) {
        setPosition({ x: 0, y: 0 });
      }

      scaleRef.current = clampedScale;

      return clampedScale;
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (event.pointerType === 'touch') {
      event.preventDefault();
    }

    if (activePointersRef.current.size === 2) {
      const pointers = Array.from(activePointersRef.current.values());
      initialPinchDistanceRef.current = Math.hypot(
        pointers[0].x - pointers[1].x,
        pointers[0].y - pointers[1].y
      );
      initialPinchScaleRef.current = scaleRef.current;
      isDraggingRef.current = false;
    } else if (activePointersRef.current.size === 1) {
      isDraggingRef.current = scaleRef.current > 1;
      lastPointerPositionRef.current = { x: event.clientX, y: event.clientY };
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore browsers that do not support pointer capture for this pointer type
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) {
      return;
    }

    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (
      activePointersRef.current.size === 2 &&
      initialPinchDistanceRef.current &&
      initialPinchDistanceRef.current > 0
    ) {
      const pointers = Array.from(activePointersRef.current.values());
      const currentDistance = Math.hypot(
        pointers[0].x - pointers[1].x,
        pointers[0].y - pointers[1].y
      );

      const nextScale = clampScale(
        initialPinchScaleRef.current * (currentDistance / initialPinchDistanceRef.current)
      );
      const clampedScale = Number(nextScale.toFixed(3));
      const previousScale = scaleRef.current;

      if (clampedScale !== previousScale) {
        scaleRef.current = clampedScale;
        setScale(clampedScale);
      }

      if (clampedScale === 1) {
        setPosition({ x: 0, y: 0 });
      }

      return;
    }

    if (!isDraggingRef.current) {
      return;
    }

    const deltaX = event.clientX - lastPointerPositionRef.current.x;
    const deltaY = event.clientY - lastPointerPositionRef.current.y;

    lastPointerPositionRef.current = { x: event.clientX, y: event.clientY };

    setPosition((prevPosition) => ({
      x: prevPosition.x + deltaX,
      y: prevPosition.y + deltaY
    }));
  };

  const endDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) {
      return;
    }

    activePointersRef.current.delete(event.pointerId);

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore release errors
    }

    if (activePointersRef.current.size >= 2) {
      const pointers = Array.from(activePointersRef.current.values());
      initialPinchDistanceRef.current = Math.hypot(
        pointers[0].x - pointers[1].x,
        pointers[0].y - pointers[1].y
      );
      initialPinchScaleRef.current = scaleRef.current;
      isDraggingRef.current = false;
      return;
    }

    if (activePointersRef.current.size === 1) {
      const remainingPointer = Array.from(activePointersRef.current.values())[0];
      if (remainingPointer) {
        lastPointerPositionRef.current = { x: remainingPointer.x, y: remainingPointer.y };
      }
      isDraggingRef.current = scaleRef.current > 1;
      initialPinchDistanceRef.current = null;
      return;
    }

    initialPinchDistanceRef.current = null;
    isDraggingRef.current = false;
  };

  const resetView = () => {
    scaleRef.current = 1;
    setScale(1);
    setPosition({ x: 0, y: 0 });
    initialPinchDistanceRef.current = null;
    initialPinchScaleRef.current = 1;
  };

  if (!isMounted || !isOpen) return null;

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{title}</h3>
          <button className={styles.closeButton} onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div
          className={styles.posterContainer}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDragging}
          onPointerLeave={endDragging}
          onPointerCancel={endDragging}
          onDoubleClick={resetView}
        >
          <img 
            src={posterUrl} 
            alt={title}
            className={styles.posterImage}
            style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
            draggable={false}
          />
        </div>
        <div className={styles.modalControls}>
          <p className={styles.zoomHint}>
            Click or drag to pan • Scroll or pinch to zoom{scale !== 1 ? ' • Double tap or double click to reset' : ''}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PosterModal;
