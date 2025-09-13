# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack YouTube downloader web application that allows users to download YouTube videos, audio, thumbnails, and subtitles with real-time progress tracking.

### Architecture
- **Frontend**: React 18 + Vite development server
- **Backend**: Node.js + Express.js with Socket.IO for real-time communication
- **YouTube Processing**: Direct yt-dlp binary calls using Node.js spawn() 
- **Real-time Updates**: Socket.IO for progress tracking and download status

### Key Dependencies
- Backend: `express`, `socket.io`, `cors`, `dotenv`
- Frontend: `react`, `axios`, `socket.io-client`, `vite`
- External: `yt-dlp` binary (must be installed on system)

## Development Commands

### Backend (Node.js)
```bash
cd backend
npm install          # Install dependencies
npm run dev          # Start development server with nodemon
npm start           # Start production server
```
- Development server runs on `http://localhost:3001`
- Requires `yt-dlp` installed and available in PATH

### Frontend (React + Vite)
```bash
cd frontend
npm install          # Install dependencies  
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Run ESLint
npm run preview      # Preview production build
```
- Development server runs on `http://localhost:5173`
- Build output goes to `frontend/dist/`

## Code Architecture

### Backend Structure (`backend/server.js`)
- **Direct yt-dlp Integration**: Uses `spawn('yt-dlp', args)` instead of wrapper libraries
- **Progressive Download Flow**: 
  1. `/api/info` - Gets video metadata (title, thumbnail, duration)
  2. `/api/download` - Starts download process with real-time progress
- **Socket.IO Events**: `download-progress`, `download-complete`, `download-error`, `download-log`
- **File Management**: Downloads stored in `backend/downloads/{downloadId}/`
- **Timeout Handling**: 20-25 second timeouts for yt-dlp operations
- **URL Cleaning**: Removes playlist parameters, keeps only video ID

### Frontend Structure (`frontend/src/App.jsx`)
- **Progressive Disclosure UX**: Download options only appear after video analysis
- **Environment-based API**: `VITE_API_URL` for backend communication
- **Real-time Progress**: Socket.IO client for download updates
- **State Management**: React hooks for downloads, video info, loading states
- **Three-column Layout**: Main content with left/right sidebars for ads

### Key Implementation Details
- **Direct Binary Calls**: Replaced yt-dlp-wrap with direct spawn() for reliability
- **Timeout Management**: All yt-dlp calls have configurable timeouts
- **Error Handling**: Comprehensive error handling for network, parsing, and process failures
- **CORS Configuration**: Environment-based CORS origins for development/production

## Environment Configuration

### Development
- Backend: `http://localhost:3001`  
- Frontend: `http://localhost:5173`
- CORS allows both development ports

### Production
- Backend: `NODE_ENV=production`, `CORS_ORIGIN=https://frontend-domain`
- Frontend: `VITE_API_URL=https://backend-domain`

## Deployment

The project includes comprehensive deployment configurations:
- **Simple Deploy**: 2-minute setup via Railway (backend) + Netlify (frontend)
- **Docker**: Full containerization with Dockerfile for backend
- **Multiple Platforms**: Railway, Netlify, Vercel, Heroku support
- **Environment Files**: Pre-configured for production deployment

## System Requirements

- **yt-dlp**: Must be installed and available in PATH
- **ffmpeg**: Required by yt-dlp for audio conversion
- **Node.js**: Version compatible with React 18+ and Express 5+

## Common Patterns

### Adding New Download Features
1. Extend yt-dlp args in `backend/server.js:/api/download`
2. Update progress parsing logic for new output formats
3. Add UI controls in `frontend/src/App.jsx`

### Error Handling
- Backend errors emit to Socket.IO: `download-error` event
- Frontend displays errors in download status section
- All yt-dlp calls wrapped in try-catch with timeout handling

### Progress Tracking
- yt-dlp progress parsed from stdout using regex and JSON templates
- Real-time updates via Socket.IO `download-progress` events
- Progress bar and speed/ETA display in frontend