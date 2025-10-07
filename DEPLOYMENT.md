# Deployment Guide

This guide will help you deploy your personal portfolio website to GitHub Pages.

## 🚀 Quick Deployment

### Option 1: Automatic Deployment (Recommended)

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Initial portfolio setup"
   git push origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository on GitHub
   - Navigate to Settings → Pages
   - Under "Source", select "GitHub Actions"
   - The deployment will start automatically

3. **Access your site**:
   - Your site will be available at: `https://ragstohrishes.github.io`
   - The deployment usually takes 2-3 minutes

### Option 2: Manual Deployment

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Deploy the `dist/` folder**:
   - Upload the contents of the `dist/` folder to your hosting service
   - Or use any static site hosting service like Netlify, Vercel, etc.

## 🔧 Customization Before Deployment

### Update Personal Information

1. **Your Name**: 
   - Edit `src/layouts/Layout.astro` (line 18)
   - Edit `src/components/Hero.tsx` (line 27)

2. **Contact Information**:
   - Update `src/pages/contact.astro` with your email, LinkedIn, GitHub, etc.

3. **About Section**:
   - Customize `src/pages/about.astro` with your story and skills

4. **Projects**:
   - Add your projects in `src/pages/projects.astro`

5. **Resume**:
   - Update your experience in `src/pages/resume.astro`

### Add Your Photo

1. Add your photo to the `public/` directory (e.g., `public/photo.jpg`)
2. Update the Hero component in `src/components/Hero.tsx`:
   ```tsx
   // Replace the profile-placeholder div with:
   <img src="/photo.jpg" alt="Your Name" className={styles.profileImage} />
   ```

### Customize Colors

Edit `src/styles/global.css` to change the color scheme:
```css
:root {
  --color-bg-primary: #your-color;
  --color-accent: #your-accent-color;
  /* ... */
}
```

## 📝 Domain Setup (Optional)

If you want to use a custom domain:

1. **Add a CNAME file**:
   ```bash
   echo "yourdomain.com" > public/CNAME
   ```

2. **Configure DNS**:
   - Add a CNAME record pointing to `ragstohrishes.github.io`
   - Or add A records pointing to GitHub Pages IP addresses

## 🔍 Troubleshooting

### Common Issues

1. **Build fails**: Make sure all dependencies are installed (`npm install`)
2. **Styling issues**: Check that CSS files are properly imported
3. **Images not loading**: Ensure image paths are correct and files exist in `public/`
4. **GitHub Actions fails**: Check the Actions tab in your GitHub repository for error details

### Getting Help

- Check the [Astro documentation](https://docs.astro.build)
- Review the [GitHub Pages documentation](https://docs.github.com/en/pages)
- Open an issue in this repository if you need help

## 🎉 Success!

Once deployed, your portfolio will be live and ready to showcase your work to the world!
