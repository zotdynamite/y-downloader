# YouTube Downloader Web Application

A modern web application for downloading YouTube videos, thumbnails, and subtitles with real-time progress tracking.

## Features

- 🎥 Download YouTube videos in MP4 format
- 🎵 Extract audio in MP3 format
- 🖼️ Download video thumbnails
- 📝 Download subtitles and auto-generated captions
- 📊 Real-time progress tracking with Socket.IO
- 📱 Responsive design for mobile and desktop
- ⚡ Fast and efficient downloads using yt-dlp

## Prerequisites

Before running this application, you need to install yt-dlp on your system:

### Windows
```bash
# Using pip
pip install yt-dlp

# Or using winget
winget install yt-dlp
```

### macOS
```bash
# Using Homebrew
brew install yt-dlp

# Or using pip
pip install yt-dlp
```

### Linux
```bash
# Using pip
pip install yt-dlp

# Or using package manager (Ubuntu/Debian)
sudo apt install yt-dlp
```

## Installation

1. Clone or download this project
2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd frontend
npm install
```

## Running the Application

1. Start the backend server:
```bash
cd backend
npm run dev
```
The backend will run on http://localhost:3001

2. Start the frontend development server:
```bash
cd frontend
npm run dev
```
The frontend will run on http://localhost:5173

3. Open your browser and navigate to http://localhost:5173

## Usage

1. Paste a YouTube URL into the input field
2. Click "Get Info" to preview the video information
3. Select your preferred format (MP4 video or MP3 audio)
4. Click "Start Download" to begin the download
5. Monitor the download progress in real-time
6. Once complete, download your files using the provided links

## Project Structure

```
youtube/
├── backend/
│   ├── server.js          # Express server with Socket.IO
│   ├── package.json
│   └── downloads/         # Downloaded files storage
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main React component
│   │   ├── App.css        # Styling
│   │   └── ...
│   ├── package.json
│   └── ...
└── README.md
```

## API Endpoints

### Backend API
- `GET /api/info?url={youtube_url}` - Get video information
- `POST /api/download` - Start download process
- `GET /downloads/{downloadId}/{filename}` - Download files

### Socket.IO Events
- `download-progress` - Real-time progress updates
- `download-complete` - Download completion notification
- `download-error` - Error notifications
- `download-log` - Debug logging

## Technologies Used

### Backend
- Node.js
- Express.js
- Socket.IO (real-time communication)
- yt-dlp-wrap (YouTube downloading)
- CORS (cross-origin requests)

### Frontend
- React 18
- Vite (build tool)
- Axios (HTTP client)
- Socket.IO Client
- Modern CSS with responsive design

## Features in Detail

### Video Information Preview
- Video title and thumbnail
- Channel/uploader information
- Video duration and view count
- Responsive thumbnail display

### Download Options
- **MP4 Video**: Downloads the best quality video in MP4 format
- **MP3 Audio**: Extracts and converts audio to MP3 (192K quality)
- **Thumbnails**: Automatically downloads video thumbnails
- **Subtitles**: Downloads available subtitles in multiple languages

### Progress Tracking
- Real-time download progress percentage
- Download speed monitoring
- Estimated time remaining (ETA)
- Visual progress bars

### File Management
- Organized downloads by unique session IDs
- Direct download links for all files
- Support for multiple simultaneous downloads
- Automatic file cleanup options

## Troubleshooting

### Common Issues

1. **yt-dlp not found**
   - Make sure yt-dlp is installed and available in your PATH
   - Try reinstalling yt-dlp: `pip install --upgrade yt-dlp`

2. **CORS errors**
   - Ensure both frontend and backend are running
   - Check that the API_URL in App.jsx matches your backend URL

3. **Download failures**
   - Some videos may be restricted or unavailable
   - Try updating yt-dlp to the latest version
   - Check if the YouTube URL is valid

4. **Port conflicts**
   - Backend runs on port 3001, frontend on 5173
   - Change ports in the respective configuration files if needed

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve this application.

## License

This project is open source and available under the MIT License.

## Disclaimer

This tool is for educational and personal use only. Please respect YouTube's Terms of Service and copyright laws. Only download content you have permission to download.