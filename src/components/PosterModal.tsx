import React, { useEffect, useRef, useState } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const lastPointerPositionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
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
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  const clampScale = (value: number) => Math.min(4, Math.max(1, value));

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    setScale((prevScale) => {
      const nextScale = clampScale(prevScale - event.deltaY * 0.0015);

      if (nextScale === 1) {
        setPosition({ x: 0, y: 0 });
      }

      return Number(nextScale.toFixed(3));
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || scale === 1) {
      return;
    }

    isDraggingRef.current = true;
    lastPointerPositionRef.current = { x: event.clientX, y: event.clientY };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
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
    if (!isDraggingRef.current) {
      return;
    }

    isDraggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
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
          ref={containerRef}
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
            Click and drag to pan • Scroll to zoom{scale !== 1 ? ' • Double click to reset' : ''}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PosterModal;
