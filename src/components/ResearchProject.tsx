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
    website?: string;
  };
  authors?: string | string[];
  acceptedAt?: string | string[]; // supports single or multiple venues
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

  const parseVenues = (value?: string | string[]) => {
    if (!value) return [] as string[];
    if (Array.isArray(value)) {
      return value.map((v) => v.trim()).filter(Boolean);
    }
    const v = value.trim();
    return v ? [v] : [];
  };

  const highlightVenueTokens = (text: string) => {
    // Highlight specific words: Oral, Spotlight, Award (case-insensitive, word boundaries)
    const regex = /(\bOral\b|\bSpotlight\b|\bAward\b)/gi;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const [matched] = match;
      const start = match.index;
      const end = start + matched.length;
      if (start > lastIndex) {
        parts.push(text.slice(lastIndex, start));
      }
      parts.push(
        <span key={`${start}-${end}`} className={styles.venueHighlight}>
          {matched}
        </span>
      );
      lastIndex = end;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts;
  };

  const parsedVenues = parseVenues(acceptedAt);

  const renderMedia = () => {
    if (!mediaUrl || !mediaType) {
      return null;
    }

    const baseMediaClass = `${styles.mediaContent} ${
      mediaType === 'video' ? styles.mediaContentVideo : styles.mediaContentImage
    }`;

    if (mediaType === 'video') {
      return (
        <div className={styles.projectMedia}>
          <video 
            className={baseMediaClass}
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
            className={baseMediaClass}
            loading="lazy"
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

          {parsedVenues.length > 0 && (
            <div>
              {parsedVenues.map((venue, idx) => (
                <p key={`venue-${idx}`} className={styles.projectVenue}>
                  <em>{highlightVenueTokens(venue)}</em>
                </p>
              ))}
            </div>
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
            {links.website && (
              <a href={normalizeUrl(links.website)} className={`${styles.link} ${styles.websiteLink}`} target="_blank" rel="noopener noreferrer">
                🚀 Website
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
