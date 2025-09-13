require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const CORS_ORIGINS = process.env.NODE_ENV === 'production' 
  ? [process.env.CORS_ORIGIN] 
  : ["http://localhost:5173", "http://localhost:5174"];

const io = socketIO(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: CORS_ORIGINS,
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

if (!fs.existsSync(path.join(__dirname, 'downloads'))) {
  fs.mkdirSync(path.join(__dirname, 'downloads'));
}

function runYtDlp(args, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    // Set timeout for the operation
    const timeout = setTimeout(() => {
      ytdlp.kill('SIGTERM');
      reject(new Error(`yt-dlp operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ytdlp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytdlp.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });

    ytdlp.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function cleanYouTubeUrl(url) {
  try {
    const urlObj = new URL(url);
    // Keep only the video ID parameter, remove playlist and other parameters
    if (urlObj.searchParams.has('v')) {
      const videoId = urlObj.searchParams.get('v');
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    return url;
  } catch (e) {
    return url; // Return original if URL parsing fails
  }
}

app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  
  console.log('Getting video info for:', url);
  
  if (!url) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  try {
    const cleanUrl = cleanYouTubeUrl(url);
    console.log('Cleaned URL:', cleanUrl);
    
    const args = [
      '--dump-json',
      '--no-warnings',
      '--socket-timeout', '20',
      cleanUrl
    ];

    const output = await runYtDlp(args, 20000); // 20 second timeout
    const lines = output.trim().split('\n');
    const info = JSON.parse(lines[lines.length - 1]); // Take the last line as it might have multiple JSON objects
    
    res.json({
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      uploader: info.uploader || info.channel,
      view_count: info.view_count
    });
  } catch (error) {
    console.error('Error getting video info:', error.message);
    res.status(500).json({ error: 'Failed to get video information: ' + error.message });
  }
});

app.post('/api/download', async (req, res) => {
  const { url, format } = req.body;
  
  console.log('Starting download for:', url, 'format:', format);
  
  if (!url) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  const downloadId = Date.now().toString();
  const downloadPath = path.join(__dirname, 'downloads', downloadId);
  
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }

  res.json({ downloadId, message: 'Download started' });

  try {
    const cleanUrl = cleanYouTubeUrl(url);
    console.log('Cleaned URL for download:', cleanUrl);
    
    let args = [
      '--output', `${downloadPath}/%(title)s.%(ext)s`,
      '--write-thumbnail',
      '--write-subs',
      '--sub-langs', 'en',
      '--ignore-errors',  // Continue even if subtitle download fails
      '--socket-timeout', '30',
      '--progress-template', 'download:{"status":"downloading","percent":"%(progress.percent)s","speed":"%(progress.speed)s","eta":"%(progress.eta)s"}'
    ];

    if (format === 'mp3') {
      args.push(...[
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K'
      ]);
    } else if (format === 'mp4') {
      args.push(...[
        '-f', 'best[ext=mp4]/best'
      ]);
    }

    args.push(cleanUrl);

    const ytdlp = spawn('yt-dlp', args);

    ytdlp.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('yt-dlp stdout:', output);
      
      // Parse progress information
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('download:')) {
          try {
            const progressData = JSON.parse(line.replace('download:', ''));
            io.emit('download-progress', {
              downloadId,
              progress: parseFloat(progressData.percent) || 0,
              speed: progressData.speed,
              eta: progressData.eta
            });
          } catch (e) {
            // Ignore parsing errors
          }
        }
        
        // Simple progress detection fallback
        if (line.includes('%') && line.includes('of')) {
          const match = line.match(/(\d+(?:\.\d+)?)%/);
          if (match) {
            io.emit('download-progress', {
              downloadId,
              progress: parseFloat(match[1]),
              speed: null,
              eta: null
            });
          }
        }
      }
      
      io.emit('download-log', { downloadId, message: output });
    });

    ytdlp.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      console.log('yt-dlp stderr:', errorOutput);
      io.emit('download-log', { downloadId, message: errorOutput });
    });

    ytdlp.on('close', (code) => {
      console.log(`yt-dlp process exited with code ${code}`);
      
      if (code === 0) {
        // List downloaded files
        const files = fs.readdirSync(downloadPath);
        io.emit('download-complete', {
          downloadId,
          files: files.map(file => ({
            name: file,
            url: `/downloads/${downloadId}/${file}`
          }))
        });
      } else {
        io.emit('download-error', { 
          downloadId, 
          error: `Download failed with exit code ${code}` 
        });
      }
    });

    ytdlp.on('error', (error) => {
      console.error('yt-dlp process error:', error);
      io.emit('download-error', { 
        downloadId, 
        error: error.message 
      });
    });

  } catch (error) {
    console.error('Error starting download:', error);
    io.emit('download-error', { 
      downloadId, 
      error: error.message 
    });
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-download', (downloadId) => {
    socket.join(downloadId);
    console.log(`Client ${socket.id} joined download ${downloadId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Testing yt-dlp availability...');
  
  // Test yt-dlp installation
  const testProcess = spawn('yt-dlp', ['--version']);
  testProcess.on('close', (code) => {
    if (code === 0) {
      console.log('yt-dlp is available and working');
    } else {
      console.error('yt-dlp is not working properly');
    }
  });
  testProcess.on('error', (error) => {
    console.error('yt-dlp is not installed or not in PATH:', error.message);
  });
});