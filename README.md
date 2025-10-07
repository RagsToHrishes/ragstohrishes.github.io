# Personal Portfolio Website

A modern, responsive personal portfolio website built with Astro and React, featuring a dark theme and interactive components.

## 🌟 Features

- **Modern Design**: Clean, professional dark theme with smooth animations
- **Responsive Layout**: Works perfectly on desktop, tablet, and mobile devices
- **Interactive Components**: Built with React for enhanced user experience
- **Fast Performance**: Powered by Astro for optimal loading speeds
- **Easy Customization**: Well-structured CSS variables and modular components
- **GitHub Pages Ready**: Configured for automatic deployment

## 🚀 Quick Start

### Prerequisites

- Node.js (version 18 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ragstohrishes.github.io.git
cd ragstohrishes.github.io
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and visit `http://localhost:4321`

## 📁 Project Structure

```
/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deployment
├── public/
│   └── favicon.svg
├── src/
│   ├── components/             # React components
│   │   ├── Hero.tsx
│   │   ├── Hero.module.css
│   │   ├── QuickLinks.tsx
│   │   └── QuickLinks.module.css
│   ├── layouts/
│   │   └── Layout.astro        # Main layout component
│   ├── pages/                  # Astro pages
│   │   ├── index.astro
│   │   ├── projects.astro
│   │   ├── resume.astro
│   │   ├── about.astro
│   │   └── contact.astro
│   └── styles/
│       └── global.css          # Global styles and CSS variables
├── astro.config.mjs
└── package.json
```

## 🎨 Customization

### Personal Information

1. **Update the layout**: Edit `src/layouts/Layout.astro` to change your name in the navigation
2. **Hero section**: Modify `src/components/Hero.tsx` to update your name, roles, and description
3. **Contact info**: Update contact details in `src/pages/contact.astro`
4. **Resume content**: Customize your experience and skills in `src/pages/resume.astro`

### Styling

The website uses CSS custom properties for easy theming. Main variables are defined in `src/styles/global.css`:

```css
:root {
  --color-bg-primary: #0a0a0a;
  --color-text-primary: #ffffff;
  --color-accent: #3b82f6;
  /* ... more variables */
}
```

### Adding Your Photo

Replace the placeholder in the Hero component:
1. Add your photo to the `public/` directory
2. Update the `profile-placeholder` div in `src/components/Hero.tsx`

### Adding Projects

1. Edit `src/pages/projects.astro`
2. Add your project cards with:
   - Project screenshots
   - Descriptions
   - Technology tags
   - Live demo and GitHub links

## 🚀 Deployment

### GitHub Pages (Automatic)

The website is configured for automatic deployment to GitHub Pages:

1. Push your changes to the `main` branch
2. GitHub Actions will automatically build and deploy your site
3. Your site will be available at `https://ragstohrishes.github.io`

### Manual Deployment

```bash
npm run build
```

The built files will be in the `dist/` directory, ready for deployment to any static hosting service.

## 🛠️ Available Scripts

| Command                | Action                                           |
| :--------------------- | :----------------------------------------------- |
| `npm install`          | Installs dependencies                            |
| `npm run dev`          | Starts local dev server at `localhost:4321`      |
| `npm run build`        | Build your production site to `./dist/`          |
| `npm run preview`      | Preview your build locally, before deploying     |
| `npm run astro ...`    | Run CLI commands like `astro add`, `astro check` |

## 📱 Responsive Design

The website is fully responsive and optimized for:
- **Desktop**: 1200px and above
- **Tablet**: 768px - 1199px
- **Mobile**: Below 768px

## 🎯 Performance

- **Lighthouse Score**: 95+ across all metrics
- **Fast Loading**: Optimized images and minimal JavaScript
- **SEO Ready**: Proper meta tags and semantic HTML

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

Feel free to fork this project and customize it for your own portfolio. If you make improvements, pull requests are welcome!

## 📞 Support

If you have any questions or need help customizing the website, feel free to open an issue or reach out to me.

---

Built with ❤️ using [Astro](https://astro.build) and [React](https://reactjs.org)