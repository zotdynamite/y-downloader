# YouTube Downloader - Deployment Guide 🚀

This guide covers multiple deployment options for your YouTube downloader application.

## 📋 Pre-Deployment Checklist

1. ✅ **Environment Variables Configured**
2. ✅ **Production Build Ready**
3. ✅ **yt-dlp Available on Target Platform**
4. ✅ **Domain Names Ready**

---

## 🌟 Recommended: Railway Deployment (Easiest)

### Backend Deployment on Railway

1. **Sign up at [Railway.app](https://railway.app)**
2. **Connect your GitHub repository**
3. **Deploy Backend:**
   ```bash
   # Push your code to GitHub first
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```
4. **In Railway Dashboard:**
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Choose the `backend` folder
   - Railway auto-detects the Node.js app
5. **Set Environment Variables:**
   ```
   NODE_ENV=production
   CORS_ORIGIN=https://your-frontend-domain.netlify.app
   ```
6. **Railway automatically provides HTTPS URL**

### Frontend Deployment on Netlify

1. **Sign up at [Netlify.com](https://netlify.com)**
2. **Deploy Frontend:**
   - Connect your GitHub repository
   - Set build command: `cd frontend && npm run build`
   - Set publish directory: `frontend/dist`
3. **Set Environment Variables:**
   ```
   VITE_API_URL=https://your-backend.railway.app
   ```
4. **Deploy automatically on git push**

---

## 🐳 Docker Deployment

### Build and Run with Docker

```bash
# Build backend Docker image
cd backend
docker build -t youtube-downloader-backend .

# Run backend container
docker run -d \
  -p 3001:3001 \
  -e NODE_ENV=production \
  -e CORS_ORIGIN=https://your-frontend-domain.com \
  --name yt-backend \
  youtube-downloader-backend

# Build frontend
cd ../frontend
npm run build

# Serve frontend with nginx or any static server
```

### Docker Compose (Full Stack)

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - CORS_ORIGIN=https://yourdomain.com
    volumes:
      - ./downloads:/app/downloads

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
```

Run: `docker-compose up -d`

---

## ☁️ Cloud Platform Deployments

### 1. Vercel (Frontend) + Railway (Backend)

**Frontend on Vercel:**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy frontend
cd frontend
vercel

# Set environment variables in Vercel dashboard
VITE_API_URL=https://your-backend.railway.app
```

**Backend on Railway:** (Follow Railway steps above)

### 2. Netlify (Frontend) + Heroku (Backend)

**Frontend on Netlify:** (Follow Netlify steps above)

**Backend on Heroku:**
```bash
# Install Heroku CLI
# Create Procfile in backend/
echo "web: npm start" > backend/Procfile

# Deploy to Heroku
cd backend
heroku create your-app-name
heroku config:set NODE_ENV=production
heroku config:set CORS_ORIGIN=https://your-frontend.netlify.app
git add .
git commit -m "Deploy to Heroku"
git push heroku main
```

### 3. AWS Deployment

**Frontend on S3 + CloudFront:**
```bash
# Build frontend
cd frontend && npm run build

# Upload dist/ folder to S3 bucket
# Configure bucket for static website hosting
# Set up CloudFront distribution
```

**Backend on EC2 or Lambda:**
- **EC2:** Use Docker or PM2
- **Lambda:** Convert to serverless functions

---

## 🔧 Environment Configuration

### Production Environment Files

**Frontend (`.env.production`):**
```env
VITE_API_URL=https://your-backend-domain.com
```

**Backend (`.env`):**
```env
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://your-frontend-domain.com
```

---

## 🏗️ Build Commands

### Frontend Build
```bash
cd frontend
npm run build
# Output: dist/ folder ready for deployment
```

### Backend Build
```bash
cd backend
# No build step needed - Node.js runs directly
npm start
```

---

## 🔒 Security Considerations

1. **HTTPS Required:** Both frontend and backend should use HTTPS
2. **CORS Configuration:** Set proper CORS origins in production
3. **Environment Variables:** Never commit `.env` files
4. **Rate Limiting:** Consider adding rate limiting for API endpoints
5. **File Cleanup:** Implement automatic cleanup of downloaded files

---

## 📊 Monitoring & Performance

### Recommended Monitoring
- **Backend:** Railway/Heroku built-in monitoring
- **Frontend:** Netlify/Vercel analytics
- **Custom:** Google Analytics, Sentry for error tracking

### Performance Tips
- **CDN:** Use CloudFront or similar for frontend
- **File Storage:** Consider cloud storage for downloads
- **Caching:** Implement Redis for temporary data
- **Auto-scaling:** Use platform auto-scaling features

---

## 🚀 Quick Start Deployment (5 minutes)

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin your-github-repo
   git push -u origin main
   ```

2. **Deploy Backend (Railway):**
   - Go to Railway.app
   - "New Project" → "Deploy from GitHub"
   - Select repo → backend folder
   - Set `CORS_ORIGIN` env var

3. **Deploy Frontend (Netlify):**
   - Go to Netlify.com
   - "New site from Git" → Select repo
   - Build: `cd frontend && npm run build`
   - Publish: `frontend/dist`
   - Set `VITE_API_URL` env var

4. **Done!** Your app is live on the internet! 🎉

---

## 🆘 Troubleshooting

### Common Issues

1. **CORS Errors:**
   - Check CORS_ORIGIN matches frontend domain exactly
   - Include https:// in URLs

2. **yt-dlp Not Found:**
   - Ensure yt-dlp is installed in deployment environment
   - Check Dockerfile includes yt-dlp installation

3. **Build Failures:**
   - Check Node.js version compatibility
   - Verify all dependencies in package.json

4. **File Download Issues:**
   - Check file permissions in deployment
   - Verify downloads directory exists

### Support

- **Railway:** [Railway Docs](https://docs.railway.app)
- **Netlify:** [Netlify Docs](https://docs.netlify.com)
- **Vercel:** [Vercel Docs](https://vercel.com/docs)
- **Heroku:** [Heroku Docs](https://devcenter.heroku.com)

---

## 💰 Cost Estimates

### Free Tier Options
- **Railway:** 500 hours/month free
- **Netlify:** 100GB bandwidth free
- **Vercel:** 100GB bandwidth free
- **Heroku:** 1000 dyno hours free (with credit card)

### Recommended Production Setup
- **Backend:** Railway Pro ($5-20/month)
- **Frontend:** Netlify/Vercel (Free or $20/month)
- **Domain:** $10-15/year
- **Total:** ~$5-40/month depending on usage

---

🎉 **Your YouTube Downloader is ready for the world!** 🌍