require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Node.js 18+ has fetch built-in

// YouTube player config parsing
async function parseYouTubePlayer(videoId) {
  try {
    console.log(`Parsing YouTube player config for video: ${videoId}`);

    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Extract player configuration
    const playerConfigMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/);
    if (playerConfigMatch) {
      const playerConfig = JSON.parse(playerConfigMatch[1]);
      const streamingData = playerConfig.streamingData;

      if (!streamingData) {
        throw new Error('No streaming data found - video may be restricted');
      }

      // Get video info
      const videoDetails = playerConfig.videoDetails;
      const videoInfo = {
        title: videoDetails?.title || 'Unknown Title',
        author: videoDetails?.author || 'Unknown Author',
        lengthSeconds: parseInt(videoDetails?.lengthSeconds) || 0,
        thumbnail: videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url || null,
        viewCount: videoDetails?.viewCount || 0
      };

      // Get video formats
      const formats = [
        ...(streamingData.formats || []),
        ...(streamingData.adaptiveFormats || [])
      ];

      // Sort by quality (highest first)
      const sortedFormats = formats
        .filter(format => format.url || format.signatureCipher)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      return {
        videoInfo,
        formats: sortedFormats
      };
    }

    throw new Error('Could not find player configuration');
  } catch (error) {
    console.error('YouTube parsing failed:', error.message);
    throw error;
  }
}

// Download video from direct URL with progress
async function downloadFromUrl(url, outputPath, format = 'mp4', downloadId, io) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const fs = require('fs');
    const path = require('path');

    const filename = `video.${format}`;
    const filePath = path.join(outputPath, filename);
    const file = fs.createWriteStream(filePath);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length']) || 0;
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0 && io && downloadId) {
          const progress = (downloadedSize / totalSize) * 100;
          io.emit('download-progress', {
            downloadId,
            progress: Math.round(progress),
            speed: null,
            eta: null
          });
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(filename);
      });

      file.on('error', (err) => {
        fs.unlink(filePath, () => {}); // Delete incomplete file
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

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

app.post('/api/download-direct', async (req, res) => {
  const { url, format } = req.body;

  console.log('Starting direct download for:', url, 'format:', format);

  if (!url) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  const downloadId = Date.now().toString();
  const downloadPath = path.join(__dirname, 'downloads', downloadId);

  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }

  res.json({ downloadId, message: 'Direct download started' });

  try {
    const cleanUrl = cleanYouTubeUrl(url);
    const videoIdMatch = cleanUrl.match(/[?&]v=([^&]+)/);

    if (!videoIdMatch) {
      throw new Error('Invalid YouTube URL');
    }

    const videoId = videoIdMatch[1];

    io.emit('download-log', { downloadId, message: 'Parsing YouTube player configuration...' });

    // Try direct parsing method
    const result = await parseYouTubePlayer(videoId);

    if (!result.formats || result.formats.length === 0) {
      throw new Error('No video formats found');
    }

    io.emit('download-log', { downloadId, message: `Found ${result.formats.length} video formats` });

    // Select best format based on request
    let selectedFormat;
    if (format === 'mp4') {
      // Find best MP4 video format
      selectedFormat = result.formats.find(f =>
        f.mimeType && f.mimeType.includes('video/mp4') && f.url
      );
    } else if (format === 'mp3') {
      // Find best audio format
      selectedFormat = result.formats.find(f =>
        f.mimeType && f.mimeType.includes('audio/') && f.url
      );
    }

    if (!selectedFormat) {
      // Fallback to first available format
      selectedFormat = result.formats.find(f => f.url);
    }

    if (!selectedFormat || !selectedFormat.url) {
      throw new Error('No downloadable format found');
    }

    io.emit('download-log', { downloadId, message: 'Starting direct download from YouTube servers...' });

    // Download the file with progress tracking
    const filename = await downloadFromUrl(
      selectedFormat.url,
      downloadPath,
      format === 'mp3' ? 'mp3' : 'mp4',
      downloadId,
      io
    );

    io.emit('download-complete', {
      downloadId,
      files: [{
        name: filename,
        url: `/downloads/${downloadId}/${filename}`
      }]
    });

  } catch (error) {
    console.error('Direct download failed:', error.message);
    io.emit('download-error', {
      downloadId,
      error: `Direct download failed: ${error.message}`
    });
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