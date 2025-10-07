import React, { useState } from 'react';
import PosterModal from './PosterModal';
import styles from './ResearchProject.module.css';

interface ResearchProjectProps {
  title: string;
  description: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  posterUrl?: string;
  links: {
    paper?: string;
    github?: string;
    demo?: string;
    data?: string;
  };
  tags: string[];
}

const ResearchProject: React.FC<ResearchProjectProps> = ({
  title,
  description,
  mediaUrl,
  mediaType,
  posterUrl,
  links,
  tags
}) => {
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false);

  return (
    <>
      <div className={styles.projectCard}>
        <div className={styles.projectMedia}>
          {mediaType === 'video' ? (
            <video 
              className={styles.mediaContent}
              controls
              poster={posterUrl}
              preload="metadata"
            >
              <source src={mediaUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          ) : (
            <img 
              src={mediaUrl} 
              alt={title}
              className={styles.mediaContent}
            />
          )}
        </div>
        
        <div className={styles.projectContent}>
          <h3 className={styles.projectTitle}>{title}</h3>
          
          <p className={styles.projectDescription}>{description}</p>
          
          <div className={styles.projectTags}>
            {tags.map((tag, index) => (
              <span key={index} className={styles.tag}>{tag}</span>
            ))}
          </div>
          
          <div className={styles.projectLinks}>
            {links.paper && (
              <a href={links.paper} className={`${styles.link} ${styles.paperLink}`} target="_blank" rel="noopener noreferrer">
                📄 Paper
              </a>
            )}
            {links.github && (
              <a href={links.github} className={`${styles.link} ${styles.githubLink}`} target="_blank" rel="noopener noreferrer">
                🐙 GitHub
              </a>
            )}
            {links.demo && (
              <a href={links.demo} className={`${styles.link} ${styles.demoLink}`} target="_blank" rel="noopener noreferrer">
                🚀 Demo
              </a>
            )}
            {links.data && (
              <a href={links.data} className={`${styles.link} ${styles.dataLink}`} target="_blank" rel="noopener noreferrer">
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
