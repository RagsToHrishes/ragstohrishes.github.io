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
        
    
        <img 
          src="/images/selfie.jpeg" 
          alt="Hrish Leen" 
          className={styles.profileImage}
        />
         
        
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
