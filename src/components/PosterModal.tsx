import React, { useEffect } from 'react';

interface PosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  posterUrl: string;
  title: string;
}

const PosterModal: React.FC<PosterModalProps> = ({ isOpen, onClose, posterUrl, title }) => {
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
        <div className={styles.posterContainer}>
          <img 
            src={posterUrl} 
            alt={title}
            className={styles.posterImage}
            draggable={false}
          />
        </div>
        <div className={styles.modalControls}>
          <p className={styles.zoomHint}>Click and drag to pan • Scroll to zoom</p>
        </div>
      </div>
    </div>
  );
};

export default PosterModal;
