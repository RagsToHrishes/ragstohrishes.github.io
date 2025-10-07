import React, { useState, useEffect } from 'react';
import styles from './Hero.module.css';

const Hero: React.FC = () => {
  const [currentRole, setCurrentRole] = useState(0);
  const roles = [
    'Full Stack Developer',
    'UI/UX Designer',
    'Problem Solver',
    'Tech Enthusiast',
    'Creative Thinker'
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentRole((prev) => (prev + 1) % roles.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [roles.length]);

  return (
    <section className={styles.hero}>
      <div className={styles.heroContent}>
        <h1 className={`${styles.heroTitle} animate-fade-in-up`}>
          Hi, I'm <span className={styles.nameHighlight}>Hrish Leen</span>
        </h1>
        
        <div className={`${styles.heroImage} animate-fade-in`} style={{ animationDelay: '0.2s' }}>
          <div className={styles.imageContainer}>
            <div className={styles.profilePlaceholder}>
              <div className={styles.placeholderIcon}>
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className={styles.placeholderText}>Your Photo Here</p>
            </div>
            <div className={styles.imageGlow}></div>
          </div>
        </div>
        
        <div className={`${styles.heroRole} animate-fade-in-up`} style={{ animationDelay: '0.4s' }}>
          <span className={styles.roleText}>I'm a </span>
          <span className={styles.roleRotating}>{roles[currentRole]}</span>
        </div>
        
        <p className={`${styles.heroDescription} animate-fade-in-up`} style={{ animationDelay: '0.6s' }}>
          Passionate about creating beautiful, functional, and user-centered digital experiences.
          I love turning complex problems into simple, elegant solutions.
        </p>
        
        <div className={`${styles.heroButtons} animate-fade-in-up`} style={{ animationDelay: '0.8s' }}>
          <a href="/research" className="btn btn-primary">
            View My Research
          </a>
          <a href="/contact" className="btn btn-secondary">
            Get In Touch
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
