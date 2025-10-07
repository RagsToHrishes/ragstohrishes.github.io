import React, { useState } from 'react';
import PosterModal from './PosterModal';
import styles from './ResearchProject.module.css';

interface ResearchProjectProps {
  title: string;
  description: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'gif' | 'video';
  posterUrl?: string;
  links: {
    paper?: string;
    github?: string;
    demo?: string;
    data?: string;
  };
  authors?: string | string[];
  acceptedAt?: string;
  tags: string[];
}

const ResearchProject: React.FC<ResearchProjectProps> = ({
  title,
  description,
  mediaUrl,
  mediaType,
  posterUrl,
  links,
  authors,
  acceptedAt,
  tags
}) => {
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);

  const normalizeUrl = (url: string) => {
    if (!url) return url;
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return trimmedUrl;
    const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmedUrl);
    return hasProtocol ? trimmedUrl : `https://${trimmedUrl}`;
  };

  const parseAuthors = (value?: string | string[]) => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((author) => author.trim()).filter(Boolean);
    }
    return value
      .split(',')
      .map((author) => author.trim())
      .filter(Boolean);
  };

  const parsedAuthors = parseAuthors(authors);

  const renderMedia = () => {
    if (!mediaUrl || !mediaType) {
      return null;
    }

    if (mediaType === 'video') {
      return (
        <div className={styles.projectMedia}>
          <video 
            className={styles.mediaContent}
            controls
            poster={posterUrl}
            preload="metadata"
          >
            <source src={mediaUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    if (mediaType === 'image' || mediaType === 'gif') {
      return (
        <div className={styles.projectMedia}>
          <img 
            src={mediaUrl} 
            alt={title}
            className={styles.mediaContent}
          />
        </div>
      );
    }

    return (
      <div className={styles.projectMedia}>
        <span>Unsupported media type</span>
      </div>
    );
  };

  return (
    <>
      <div className={styles.projectCard}>
        {renderMedia()}
        
        <div className={styles.projectContent}>
          <h3 className={styles.projectTitle}>{title}</h3>
          
          {parsedAuthors.length > 0 && (
            <p className={styles.projectAuthors}>
              {parsedAuthors.map((name, index) => (
                <React.Fragment key={`${name}-${index}`}>
                  <span className={name.toLowerCase() === 'hrish leen' ? styles.authorHighlight : undefined}>
                    {name}
                  </span>
                  {index < parsedAuthors.length - 1 && ', '}
                </React.Fragment>
              ))}
            </p>
          )}

          {acceptedAt && (
            <p className={styles.projectVenue}>
              <em>{acceptedAt}</em>
            </p>
          )}
          
          <p className={styles.projectDescription}>{description}</p>
          
          <div className={styles.projectTags}>
            {tags.map((tag, index) => (
              <span key={index} className={styles.tag}>{tag}</span>
            ))}
          </div>
          
          <div className={styles.projectLinks}>
            {links.paper && (
              <a href={normalizeUrl(links.paper)} className={`${styles.link} ${styles.paperLink}`} target="_blank" rel="noopener noreferrer">
                📄 Paper
              </a>
            )}
            {links.github && (
              <a href={normalizeUrl(links.github)} className={`${styles.link} ${styles.githubLink}`} target="_blank" rel="noopener noreferrer">
                🐙 GitHub
              </a>
            )}
            {links.demo && (
              <a href={normalizeUrl(links.demo)} className={`${styles.link} ${styles.demoLink}`} target="_blank" rel="noopener noreferrer">
                🚀 Demo
              </a>
            )}
            {links.data && (
              <a href={normalizeUrl(links.data)} className={`${styles.link} ${styles.dataLink}`} target="_blank" rel="noopener noreferrer">
                📊 Data
              </a>
            )}
            {posterUrl && (
              <button 
                className={`${styles.link} ${styles.posterLink}`}
                onClick={() => setIsPosterModalOpen(true)}
              >
                🖼️ Poster
              </button>
            )}
          </div>
        </div>
      </div>
      
      {posterUrl && (
        <PosterModal
          isOpen={isPosterModalOpen}
          onClose={() => setIsPosterModalOpen(false)}
          posterUrl={posterUrl}
          title={`${title} - Research Poster`}
        />
      )}
    </>
  );
};

export default ResearchProject;
