import { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('mp4');
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [downloads, setDownloads] = useState([]);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.on('download-progress', (data) => {
      setDownloads(prev => prev.map(download => 
        download.id === data.downloadId 
          ? { ...download, progress: data.progress, speed: data.speed, eta: data.eta }
          : download
      ));
    });

    newSocket.on('download-complete', (data) => {
      setDownloads(prev => prev.map(download => 
        download.id === data.downloadId 
          ? { ...download, status: 'completed', files: data.files, progress: 100 }
          : download
      ));
    });

    newSocket.on('download-error', (data) => {
      setDownloads(prev => prev.map(download => 
        download.id === data.downloadId 
          ? { ...download, status: 'error', error: data.error }
          : download
      ));
    });

    newSocket.on('download-log', (data) => {
      console.log('Download log:', data.message);
    });

    return () => newSocket.close();
  }, []);

  const getVideoInfo = async () => {
    if (!url) return;
    
    try {
      setLoading(true);
      console.log('Fetching video info for:', url);
      console.log('API URL:', `${API_URL}/api/info`);
      
      const response = await axios.get(`${API_URL}/api/info`, {
        params: { url },
        timeout: 25000
      });
      
      console.log('Video info response:', response.data);
      setVideoInfo(response.data);
    } catch (error) {
      console.error('Error getting video info:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
      alert(`Error getting video information: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const startDownload = async () => {
    if (!url) return;

    try {
      setLoading(true);
      console.log('Starting download for:', url, 'format:', format);
      
      const response = await axios.post(`${API_URL}/api/download`, {
        url,
        format
      }, { timeout: 25000 });

      console.log('Download response:', response.data);

      const newDownload = {
        id: response.data.downloadId,
        url: url,
        format: format,
        status: 'downloading',
        progress: 0,
        videoInfo: videoInfo
      };

      setDownloads(prev => [newDownload, ...prev]);
      
      if (socket) {
        console.log('Joining download room:', response.data.downloadId);
        socket.emit('join-download', response.data.downloadId);
      }

    } catch (error) {
      console.error('Error starting download:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
      alert(`Error starting download: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const resetAll = () => {
    // Add a little visual feedback
    const button = document.querySelector('.reset-button');
    if (button) {
      button.style.transform = 'scale(0.95)';
      setTimeout(() => {
        button.style.transform = '';
      }, 150);
    }
    
    // Reset all state
    setUrl('');
    setFormat('mp4');
    setLoading(false);
    setVideoInfo(null);
    setDownloads([]);
    console.log('🔄 Reset all data - Ready for new downloads!');
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>YouTube Downloader</h1>
        <p>Download YouTube videos, thumbnails, and subtitles</p>
      </header>
      
      <div className="app-container">
        {/* Left Sidebar for Ads */}
        <aside className="left-sidebar">
          <div className="ad-space">
            <div>
              <p>📢 Advertisement Space</p>
              <p>Google AdSense</p>
              <p>250x250 or 250x400</p>
            </div>
          </div>
          <div className="ad-space banner">
            <div>
              <p>📢 Banner Ad</p>
              <p>250x120</p>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="app-content">
          <main className="main-content">
        <div className="input-section">
          <h2 className="section-title">Video Input</h2>
          <div className="url-input-group">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter YouTube URL here..."
              className="url-input"
            />
            <button 
              onClick={getVideoInfo} 
              disabled={loading || !url}
              className="info-button"
            >
              {loading ? (
                <>
                  <span className="loading-spinner"></span>
                  Processing...
                </>
              ) : (
                'Get Info'
              )}
            </button>
          </div>

          {videoInfo && (
            <div className="video-info">
              <div className="video-preview">
                <img src={videoInfo.thumbnail} alt="Video thumbnail" />
                <div className="video-details">
                  <h3>{videoInfo.title}</h3>
                  <p><strong>Uploader:</strong> {videoInfo.uploader}</p>
                  <p><strong>Duration:</strong> {Math.floor(videoInfo.duration / 60)}:{(videoInfo.duration % 60).toString().padStart(2, '0')}</p>
                  <p><strong>Views:</strong> {videoInfo.view_count?.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}

          {videoInfo && (
            <>
              <div className="format-section">
                <label>
                  <strong>Download Format:</strong>
                  <select 
                    value={format} 
                    onChange={(e) => setFormat(e.target.value)}
                    className="format-select"
                  >
                    <option value="mp4">MP4 Video</option>
                    <option value="mp3">MP3 Audio</option>
                  </select>
                </label>
              </div>

              <div className="action-buttons">
                <button 
                  onClick={startDownload} 
                  disabled={loading || !url}
                  className="download-button"
                >
                  {loading ? (
                    <>
                      <span className="loading-spinner"></span>
                      Processing...
                    </>
                  ) : (
                    'Start Download'
                  )}
                </button>
                <button 
                  onClick={resetAll} 
                  className="reset-button"
                  title="Reset all data"
                >
                  🔄 Reset
                </button>
              </div>
            </>
          )}

          {!videoInfo && !loading && url && (
            <div className="info-hint">
              <p>👆 Click "Get Info" to analyze the video and unlock download options</p>
            </div>
          )}
        </div>

        <div className="downloads-section">
          <h2>Downloads</h2>
          {downloads.length === 0 ? (
            <p className="no-downloads">No downloads yet</p>
          ) : (
            <div className="downloads-list">
              {downloads.map((download) => (
                <div key={download.id} className="download-item">
                  <div className="download-header">
                    <h4>{download.videoInfo?.title || 'Loading...'}</h4>
                    <span className={`status ${download.status}`}>
                      {download.status}
                    </span>
                  </div>
                  
                  {download.status === 'downloading' && (
                    <div className="progress-section">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${download.progress || 0}%` }}
                        ></div>
                      </div>
                      <div className="progress-info">
                        <span>{Math.round(download.progress || 0)}%</span>
                        {download.speed && <span>Speed: {formatBytes(download.speed)}/s</span>}
                        {download.eta && <span>ETA: {download.eta}s</span>}
                      </div>
                    </div>
                  )}

                  {download.status === 'completed' && download.files && (
                    <div className="files-section">
                      <h5>Downloaded Files:</h5>
                      <ul className="files-list">
                        {download.files.map((file, index) => (
                          <li key={index}>
                            <a 
                              href={`${API_URL}${file.url}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="file-link"
                            >
                              {file.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {download.status === 'error' && (
                    <div className="error-section">
                      <p className="error-message">Error: {download.error}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          </div>
        </main>
      </div>

      {/* Right Sidebar for Ads */}
      <aside className="right-sidebar">
        <div className="ad-space wide">
          <div>
            <p>📢 Advertisement Space</p>
            <p>Google AdSense</p>
            <p>250x400</p>
          </div>
        </div>
        <div className="ad-space">
          <div>
            <p>📢 Square Ad</p>
            <p>250x250</p>
          </div>
        </div>
      </aside>
    </div>
  </div>
  );
}

export default App
