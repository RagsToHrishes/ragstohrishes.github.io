export type ResearchLinkSet = {
  paper?: string;
  github?: string;
  website?: string;
  data?: string;
};

export type ResearchProjectEntry = {
  title: string;
  description: string;
  links: ResearchLinkSet;
  authors: string[];
  acceptedAt: string | string[];
  mediaType?: 'image' | 'gif' | 'video';
  mediaUrl?: string;
  posterUrl?: string;
  posterSources?: Array<{ src: string; width: number }>;
  tags: string[];
};

export type TimelineEntry = {
  title: string;
  organization: string;
  period: string;
  description: string;
  bullets: string[];
  logo?: {
    src: string;
    alt: string;
  };
};

export type EducationDetail = {
  text: string;
  href?: string;
};

export type EducationEntry = {
  degree: string;
  institution: string;
  period: string;
  details: EducationDetail[];
  logo?: {
    src: string;
    alt: string;
  };
};

export const profile = {
  name: 'Hrish Leen',
  greeting: "What's up, I'm Hrish Leen",
  title: 'PhD Student in Robotics',
  institution: 'Georgia Institute of Technology',
  description:
    'Personal website and portfolio showcasing research, skills, experience, and ways to get in touch.',
  interestsLabel: "I'm interested in",
  interests: [
    'Robot Learning',
    'Reinforcement Learning',
    'Multi-Agent Systems',
    'World Models',
    'Dexterous Manipulation',
  ],
  intro: [
    "I'm a PhD student at the Georgia Institute of Technology, where I work with Prof. Animesh Garg at the People, AI & Robots Lab on robot learning. My research focuses on imbuing robots with physical intelligence, driven by a broader curiosity to understand the inner workings of the human brain.",
    "Previously, I completed my undergraduate and master's degrees at UC Berkeley, where I worked with Prof. Sergey Levine in the Robotic AI and Learning Lab.",
  ],
  links: [
    {
      label: 'Email',
      href: 'mailto:hrishi.leen@gmail.com',
    },
    {
      label: 'GitHub',
      href: 'https://github.com/RagsToHrishes',
    },
    {
      label: 'LinkedIn',
      href: 'https://www.linkedin.com/in/hrish-leen-1451a71b8/',
    },
  ],
  simHint:
    'The background is an ambient worker-boid power grid. The swarm keeps power, cells, workers, and factory output in balance while the dashboard tracks the cycles.',
};

export const researchProjects: ResearchProjectEntry[] = [
  {
    title: 'FLASH: Flow-Based Language-Annotated Grasp Synthesis for Dexterous Hands',
    description:
      'FLASH, a method for language-conditioned dexterous grasping that jointly models task intent and physical contact quality for robot hands.',
    links: {
      paper: 'bit.ly/flashgrasp',
    },
    authors: [
      'Hrish Leen',
      'Jeremy A. Collins',
      'Kunal Aneja',
      'Nhi Nguyen',
      'Priyadarshini Tamilselvan',
      'Sri Siddarth Chakaravarthy P',
      'Animesh Garg',
    ],
    acceptedAt: 'CoRL 2025 Workshop Dexterous Manipulation Spotlight',
    posterUrl: '/research/FLASH/poster-3000.jpg',
    posterSources: [
      { src: '/research/FLASH/poster-1600.jpg', width: 1600 },
      { src: '/research/FLASH/poster-3000.jpg', width: 3000 },
      { src: '/research/FLASH/poster-6000.jpg', width: 6000 },
    ],
    mediaType: 'gif',
    mediaUrl: '/research/FLASH/trajectory.gif',
    tags: [],
  },
  {
    title: 'Towards Policy-Aware World Models',
    description:
      'Policy-gradient ESNR predicts downstream policy performance, giving a practical diagnostic for "policy-aware" world models and guiding pretraining, architecture tweaks, and policy choice.',
    links: {
      paper: 'https://openreview.net/pdf?id=Ro2eG1RRde',
      website: 'https://policy-aware.github.io/paper-anon/',
    },
    authors: [
      'Varun Giridhar',
      'Ignat Georgiev',
      'Hrish Leen',
      'Nicklas Hansen',
      'Animesh Garg',
    ],
    acceptedAt: 'Preprint',
    mediaType: 'gif',
    mediaUrl: '/research/Policy-Aware-WM/tpwm.gif',
    tags: [],
  },
  {
    title: 'Dexterous Learning for Dexterous Robot Grasping - A Survey',
    description:
      'A comprehensive survey of deep learning approaches for dexterous robotic grasping, emphasizing recent progress enabled by multi-modal models and data-driven techniques.',
    links: {
      paper: 'bit.ly/graspSurvey',
    },
    authors: [
      'Hrish Leen',
      'Kunal Aneja',
      'Chetan Reddy',
      'Priyadarshini Tamilselvan',
      'Nhi Nguyen',
      'Sri Siddarth Chakaravarthy',
      'Jeremy Collins',
      'Miroslav Bogdanovic',
      'Animesh Garg',
    ],
    acceptedAt: 'Journal Preprint',
    mediaType: 'image',
    mediaUrl: '/research/Survey/OverallFigure.png',
    tags: [],
  },
  {
    title: 'Offline Reinforcement Learning for Customizable Visual Navigation',
    description:
      "Offline RL doesn't scale well for long-horizon navigation but using values predicted with ORL within a topological graph framework can enable cool behavior on real robots!",
    links: {
      paper: 'https://arxiv.org/abs/2212.08244',
      website: 'https://sites.google.com/view/revind/home',
      github: 'https://github.com/arjunbhorkar/ReViND',
    },
    authors: [
      'Dhruv Shah',
      'Arjun Bhorkar',
      'Hrish Leen',
      'Ilya Kostrikov',
      'Nicholas Rhinehart',
      'Sergey Levine',
    ],
    acceptedAt: [
      'Oral at Conference on Robot Learning (CoRL) 2022',
      'NeurIPS 2022 Workshop Offline RL',
      'NeurIPS 2022 Workshop DeepRL',
    ],
    mediaType: 'image',
    mediaUrl: '/research/ReVind/ReVindFig.png',
    tags: [],
  },
];

export const experiences: TimelineEntry[] = [
  {
    title: 'Graduate Intern',
    organization: 'Jet Propulsion Laboratory',
    period: 'Feb 2026 - Present',
    description: 'Developing reinforcement learning for dual-body mobile manipulation on rover platforms.',
    bullets: [],
    logo: {
      src: '/logos/JPL.png',
      alt: 'Jet Propulsion Laboratory logo',
    },
  },
  {
    title: 'Graduate Researcher',
    organization: 'People, AI & Robots @ Georgia Tech',
    period: '2024 - Present',
    description: 'PhD student under Prof. Animesh Garg studying Robot Learning',
    bullets: [],
    logo: {
      src: '/logos/PAIR.png',
      alt: 'PAIR',
    },
  },
  {
    title: 'Graduate Researcher',
    organization: 'Berkeley Artificial Intelligence Research',
    period: '2023 - 2024',
    description:
      'Under the advisement of PhD students Dhruv Shah and Laura Smith and Prof. Sergey Levine, completed my masters thesis in robot learning for mobile manipulation',
    bullets: [],
    logo: {
      src: '/logos/BAIR.png',
      alt: 'BAIR',
    },
  },
  {
    title: 'Undergraduate Researcher',
    organization: 'Berkeley Artificial Intelligence Research',
    period: '2022 - 2023',
    description:
      'Advised by PhD student Dhruv Shah and Prof. Sergey Levine, investigating offline reinforcement learning for navigational robots.',
    bullets: [],
    logo: {
      src: '/logos/BAIR.png',
      alt: 'BAIR',
    },
  },
  {
    title: 'IP Software Intern',
    organization: 'Apple',
    period: 'Summer 2023',
    description: 'Built/Deployed AI models in IP software assistance',
    bullets: [],
    logo: {
      src: '/logos/apple.jpg',
      alt: 'Apple',
    },
  },
];

export const volunteering: TimelineEntry[] = [
  {
    title: 'Teaching Assistant',
    organization: 'Organization Name',
    period: '2023 - 2024',
    description: 'TA for CS188 (Artificial Intelligence)',
    bullets: [],
    logo: {
      src: '/logos/AI.png',
      alt: 'Organization Name logo',
    },
  },
  {
    title: 'Academic Service',
    organization: 'UC Berkeley Electrical Engineering & Computer Sciences (EECS)',
    period: '2021 - 2022',
    description: 'Academic Intern for CS61A and CS61C. Lab tutor for EECS16B',
    bullets: [],
    logo: {
      src: '/logos/EECS.jpg',
      alt: 'EECS',
    },
  },
];

export const education: EducationEntry[] = [
  {
    degree: 'PhD Student In Robotics',
    institution: 'Georgia Insititute of Technology',
    period: '2024-Present',
    details: [],
    logo: {
      src: '/logos/GT.png',
      alt: 'Georgia Institute of Technology logo',
    },
  },
  {
    degree: 'EECS 5th Year Masters in CV/AI',
    institution: 'University of California Berkeley',
    period: '2023-2024',
    details: [
      { text: 'GPA: 3.95' },
      {
        text: 'Masters thesis',
        href: 'https://www2.eecs.berkeley.edu/Pubs/TechRpts/2024/EECS-2024-73.html',
      },
    ],
    logo: {
      src: '/logos/Berkeley.svg',
      alt: 'University of California Berkeley logo',
    },
  },
  {
    degree: 'Bachelor of Science in Computer Science',
    institution: 'University of California Berkeley',
    period: '2020 - 2023',
    details: [
      {
        text: "Honor's Degree in Mathematics, in the Dean's List for College Of Letters & Science for Fall 2020, Fall 2021, Spring 2022, GPA: 3.965",
      },
    ],
    logo: {
      src: '/logos/Berkeley.svg',
      alt: 'University of California Berkeley logo',
    },
  },
];

export const aboutSections = [
  {
    title: 'My Story',
    paragraphs: [
      "I'm a passionate full-stack developer with over 5 years of experience creating digital solutions that make a difference. My journey began with curiosity about how websites work, and it has evolved into a career dedicated to building innovative applications that solve real-world problems.",
      "I believe in the power of technology to transform ideas into reality. Whether it's a simple website, a complex web application, or a mobile app, I approach each project with enthusiasm and attention to detail.",
    ],
  },
  {
    title: 'What I Do',
    paragraphs: [
      'I specialize in modern web development, focusing on creating user-centered experiences that are both beautiful and functional. My expertise spans across the entire development stack, from designing intuitive user interfaces to building robust backend systems.',
    ],
  },
  {
    title: 'Beyond Code',
    paragraphs: [
      "When I'm not coding, you can find me exploring new technologies, contributing to open-source projects, or sharing knowledge with the developer community. I'm also passionate about photography, hiking, and trying new cuisines.",
      'I believe in continuous learning and staying up-to-date with the latest trends in technology. This mindset helps me deliver cutting-edge solutions and maintain high standards in my work.',
    ],
  },
] as const;

export const expertise = [
  {
    title: 'Frontend Development',
    description:
      'Creating responsive and interactive user interfaces using modern frameworks and tools.',
  },
  {
    title: 'Backend Development',
    description:
      'Building scalable server-side applications and APIs that power modern web experiences.',
  },
  {
    title: 'Mobile Development',
    description:
      'Developing cross-platform mobile applications that provide seamless user experiences.',
  },
  {
    title: 'DevOps & Deployment',
    description:
      'Setting up CI/CD pipelines and deploying applications to various cloud platforms.',
  },
] as const;

export const quickFacts = [
  { label: 'Location', value: 'Your City, Country' },
  { label: 'Experience', value: '5+ Years' },
  { label: 'Languages', value: 'English, Spanish' },
  { label: 'Availability', value: 'Open to opportunities' },
] as const;

export const certifications = [
  { title: 'AWS Certified Developer', detail: 'Amazon Web Services • 2023' },
  { title: 'Google Cloud Professional', detail: 'Google Cloud • 2022' },
  { title: 'React Developer Certification', detail: 'Meta • 2021' },
] as const;

export const funFacts = [
  'I drink way too much coffee',
  'I read 2-3 tech books per month',
  "I'm training for a marathon",
  'I play guitar in my spare time',
  "I'm learning Japanese",
] as const;

export const contactIntro = {
  heading: 'Get In Touch',
  subheading: "I'd love to hear from you. Send me a message!",
  sectionTitle: "Let's Connect",
  body:
    "I'm always interested in new opportunities, collaborations, and interesting projects. Whether you have a question, want to work together, or just want to say hello, I'd love to hear from you!",
};

export const contactMethods = [
  {
    title: 'Email',
    detail: 'hrishi.leen@gmail.com',
    href: 'mailto:hrishi.leen@gmail.com',
    action: 'Send Email',
  },
  {
    title: 'LinkedIn',
    detail: 'Connect with me professionally',
    href: 'https://www.linkedin.com/in/hrish-leen-1451a71b8/',
    action: 'View Profile',
  },
  {
    title: 'GitHub',
    detail: 'Check out my code and projects',
    href: 'https://github.com/RagsToHrishes',
    action: 'View Profile',
  },
] as const;

export const opportunities = [
  {
    title: 'New Research',
    description: 'Research projects and academic collaborations',
  },
  {
    title: 'Job Opportunities',
    description: 'Research internships in robot learning',
  },
] as const;
