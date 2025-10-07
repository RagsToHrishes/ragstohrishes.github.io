import React from 'react';
import styles from './QuickLinks.module.css';

interface QuickLink {
  title: string;
  description: string;
  href: string;
  icon: string;
  color: string;
}

const QuickLinks: React.FC = () => {
  const links: QuickLink[] = [
    {
      title: 'Projects',
      description: 'Explore my latest work and side projects',
      href: '/projects',
      icon: '🚀',
      color: 'var(--gradient-primary)'
    },
    {
      title: 'Resume',
      description: 'Download my CV and view experience',
      href: '/resume',
      icon: '📄',
      color: 'var(--gradient-secondary)'
    },
    {
      title: 'About',
      description: 'Learn more about my journey and skills',
      href: '/about',
      icon: '👨‍💻',
      color: 'var(--gradient-accent)'
    },
    {
      title: 'Contact',
      description: 'Get in touch and start a conversation',
      href: '/contact',
      icon: '📧',
      color: 'var(--gradient-primary)'
    }
  ];

  return (
    <section className={styles.quickLinks}>
      <div className={styles.quickLinksHeader}>
        <h2 className="text-gradient">Quick Links</h2>
        <p className={styles.textSecondary}>Navigate to different sections of my portfolio</p>
      </div>
      
      <div className={styles.quickLinksGrid}>
        {links.map((link, index) => (
          <a
            key={link.title}
            href={link.href}
            className={styles.quickLinkCard}
            style={{
              animationDelay: `${index * 0.1}s`
            }}
          >
            <div className={styles.cardIcon} style={{ background: link.color }}>
              <span className={styles.iconEmoji}>{link.icon}</span>
            </div>
            <div className={styles.cardContent}>
              <h3 className={styles.cardTitle}>{link.title}</h3>
              <p className={styles.cardDescription}>{link.description}</p>
            </div>
            <div className={styles.cardArrow}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

export default QuickLinks;
