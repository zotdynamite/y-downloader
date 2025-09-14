require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Node.js 18+ has fetch built-in

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

function runYtDlp(args, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    // Very short timeout for free tier
    const timeout = setTimeout(() => {
      ytdlp.kill('SIGKILL');
      reject(new Error(`Operation timed out`));
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
        reject(new Error(stderr || `Exit code ${code}`));
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

    // Extract video ID for oEmbed API
    const videoIdMatch = cleanUrl.match(/[?&]v=([^&]+)/);
    if (!videoIdMatch) {
      throw new Error('Invalid YouTube URL');
    }
    const videoId = videoIdMatch[1];

    // Try YouTube oEmbed API first (works without bot detection)
    try {
      console.log('Trying YouTube oEmbed API...');
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`;

      const response = await fetch(oembedUrl);
      if (response.ok) {
        const data = await response.json();
        console.log('oEmbed API succeeded!');

        res.json({
          title: data.title,
          thumbnail: data.thumbnail_url,
          duration: null, // oEmbed doesn't provide duration
          uploader: data.author_name,
          view_count: null // oEmbed doesn't provide view count
        });
        return;
      }
    } catch (oembedError) {
      console.log('oEmbed API failed:', oembedError.message);
    }

    // Fallback to yt-dlp with most reliable settings
    console.log('Trying yt-dlp fallback...');
    const args = [
      '--dump-json',
      '--no-warnings',
      '--socket-timeout', '15',
      '--retries', '1',
      '--extractor-args', 'youtube:player_client=web_creator',
      '--age-limit', '99',
      cleanUrl
    ];

    const output = await runYtDlp(args, 15000);
    const lines = output.trim().split('\n');
    const info = JSON.parse(lines[lines.length - 1]);

    res.json({
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      uploader: info.uploader || info.channel,
      view_count: info.view_count
    });
  } catch (error) {
    console.error('Error getting video info:', error.message);

    // Return basic info even if extraction fails
    const videoIdMatch = url.match(/[?&]v=([^&]+)/);
    if (videoIdMatch) {
      const videoId = videoIdMatch[1];
      res.json({
        title: `YouTube Video ${videoId}`,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: null,
        uploader: 'Unknown',
        view_count: null
      });
    } else {
      res.status(500).json({ error: 'Failed to get video information: ' + error.message });
    }
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

  // Extract video ID for alternative download links
  const videoIdMatch = url.match(/[?&]v=([^&]+)/);
  const videoId = videoIdMatch ? videoIdMatch[1] : null;

  if (!videoId) {
    io.emit('download-error', {
      downloadId,
      error: 'Invalid YouTube URL format'
    });
    return;
  }

  // Emit starting message
  io.emit('download-progress', {
    downloadId,
    progress: 0,
    speed: null,
    eta: null
  });

  try {
    const cleanUrl = cleanYouTubeUrl(url);
    console.log('Cleaned URL for download:', cleanUrl);
    
    // Advanced bypass strategies - these actually work
    const strategies = [
      // Strategy 1: iOS with full spoofing
      [
        '--output', `${downloadPath}/%(title)s.%(ext)s`,
        '--no-warnings',
        '--socket-timeout', '20',
        '--no-check-certificate',
        '--extractor-args', 'youtube:player_client=ios',
        '--user-agent', 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
        '--add-header', 'X-YouTube-Client-Name:5',
        '--add-header', 'X-YouTube-Client-Version:19.29.1',
        '--write-thumbnail',
        '--progress-template', 'download:{"percent":"%(progress.percent)s","speed":"%(progress.speed)s"}'
      ],
      // Strategy 2: Android TV bypass
      [
        '--output', `${downloadPath}/%(title)s.%(ext)s`,
        '--no-warnings',
        '--socket-timeout', '20',
        '--no-check-certificate',
        '--extractor-args', 'youtube:player_client=android_testsuite',
        '--user-agent', 'Mozilla/5.0 (Linux; Android 11; Pixel 4) AppleWebKit/537.36',
        '--write-thumbnail',
        '--progress-template', 'download:{"percent":"%(progress.percent)s","speed":"%(progress.speed)s"}'
      ],
      // Strategy 3: Media Connect bypass (works for restricted content)
      [
        '--output', `${downloadPath}/%(title)s.%(ext)s`,
        '--no-warnings',
        '--socket-timeout', '20',
        '--no-check-certificate',
        '--extractor-args', 'youtube:player_client=mediaconnect',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--geo-bypass',
        '--write-thumbnail',
        '--progress-template', 'download:{"percent":"%(progress.percent)s","speed":"%(progress.speed)s"}'
      ]
    ];

    let currentStrategy = 0;
    let args = [...strategies[currentStrategy]];

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

    const tryDownload = () => {
      console.log(`Trying download strategy ${currentStrategy + 1}...`);
      io.emit('download-log', { downloadId, message: `Trying strategy ${currentStrategy + 1}...` });

      const ytdlp = spawn('yt-dlp', args);

      ytdlp.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('yt-dlp stdout:', output);

        // Enhanced progress detection
        if (output.includes('download:')) {
          try {
            const progressData = JSON.parse(output.replace('download:', ''));
            io.emit('download-progress', {
              downloadId,
              progress: parseFloat(progressData.percent) || 0,
              speed: progressData.speed,
              eta: null
            });
          } catch (e) {
            // Fallback to simple detection
            const match = output.match(/(\d+(?:\.\d+)?)%/);
            if (match) {
              io.emit('download-progress', {
                downloadId,
                progress: parseFloat(match[1]),
                speed: null,
                eta: null
              });
            }
          }
        } else if (output.includes('%') && output.includes('of')) {
          const match = output.match(/(\d+(?:\.\d+)?)%/);
          if (match) {
            io.emit('download-progress', {
              downloadId,
              progress: parseFloat(match[1]),
              speed: null,
              eta: null
            });
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
        console.log(`Strategy ${currentStrategy + 1} exited with code ${code}`);

        if (code === 0) {
          // Success! List downloaded files
          const files = fs.readdirSync(downloadPath);
          io.emit('download-complete', {
            downloadId,
            files: files.map(file => ({
              name: file,
              url: `/downloads/${downloadId}/${file}`
            }))
          });
        } else if (currentStrategy < strategies.length - 1) {
          // Try next strategy
          currentStrategy++;
          args = [...strategies[currentStrategy]];

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

          // Retry with next strategy
          setTimeout(tryDownload, 1000); // Small delay between attempts
        } else {
          // All strategies failed
          io.emit('download-error', {
            downloadId,
            error: `All download methods failed. This video may be restricted.`
          });
        }
      });

      ytdlp.on('error', (error) => {
        console.error('yt-dlp process error:', error);
        if (currentStrategy < strategies.length - 1) {
          // Try next strategy on error too
          currentStrategy++;
          args = [...strategies[currentStrategy]];

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

          setTimeout(tryDownload, 1000);
        } else {
          io.emit('download-error', {
            downloadId,
            error: error.message
          });
        }
      });
    };

    tryDownload(); // Start the download attempt

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