// client.js
class TorrentStreamClient {
    constructor() {
        this.ws = new WebSocket(`ws://${window.location.host}`);
        this.setupWebSocket();
        this.setupEventListeners();
        this.setupKeyboardControls();
        this.seekStep = 10;
        this.isConnected = false;
        this.showStats = false;
        // Keep an array of track <track> elements so we can manage them:
        this.subtitleTracks = [];
    }

    setupWebSocket() {
        this.ws.onopen = () => {
            console.log('Connected to server');
            this.isConnected = true;
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'videoURL') {
                this.handleVideoURL(data);
            } else if (data.type === 'error') {
                this.showError(data.message);
            } else if (data.type === 'status') {
                this.updateStatus(data);
            }
        };

        this.ws.onerror = (error) => {
            this.showError('WebSocket error occurred');
        };

        this.ws.onclose = () => {
            console.log('Connection to server lost');
            this.isConnected = false;
            this.showError('Connection to server lost. Please refresh the page.');
        };
    }

    setupEventListeners() {
        const streamBtn = document.getElementById('streamBtn');
        streamBtn.addEventListener('click', () => this.handleStreamClick());
    
       

        // ====== NEW: Handle .torrent file selection ======
        const fileInput = document.getElementById('torrentFile');
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleTorrentFile(file);
            }
        });

        // ====== NEW: Optional drag-and-drop support ======
        const dropArea = document.getElementById('dragDropArea');
        // Prevent default behaviors for drag & drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, (ev) => ev.preventDefault(), false);
        });
        // Highlight on dragover
        dropArea.addEventListener('dragover', () => {
            dropArea.classList.add('drag-over');
        });
        dropArea.addEventListener('dragleave', () => {
            dropArea.classList.remove('drag-over');
        });
        // Handle dropped file
        dropArea.addEventListener('drop', (ev) => {
            dropArea.classList.remove('drag-over');
            const file = ev.dataTransfer.files[0];
            if (file) {
                this.handleTorrentFile(file);
            }
        });

        const video = document.getElementById('videoPlayer');
       
        
       
        // Stats toggle button in overlay (top-left)
        const statsBtn = document.getElementById('toggleStatsBtn');
        statsBtn.addEventListener('click', () => {
            this.showStats = !this.showStats;
            const statsPanel = document.getElementById('torrentStatus');
            statsPanel.style.display = this.showStats ? 'block' : 'none';
            statsBtn.textContent = this.showStats ? 'Hide Stats' : 'Stats';
        });

  
        
        // Subtitle selector (both overlay and separate if needed)
        const overlaySubSelect = document.getElementById('overlaySubSelect');
        overlaySubSelect.addEventListener('change', () => {
          const selectedIndex = parseInt(overlaySubSelect.value, 10);
          this.subtitleTracks.forEach((trackEl, i) => {
            trackEl.track.mode = (i === selectedIndex) ? 'showing' : 'disabled';
          });
          this.refreshToggleButton();
        });

        
    }
    

     // ====== NEW: read .torrent file as base64 and send to server ======
     handleTorrentFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            const arrayBuffer = reader.result;
            // Convert arrayBuffer -> Uint8Array -> base64
            const uint8View = new Uint8Array(arrayBuffer);

            // A quick inline base64:
            let binary = '';
            for (let i = 0; i < uint8View.length; i++) {
                binary += String.fromCharCode(uint8View[i]);
            }
            const base64String = btoa(binary);

            // Now send to server over WS
            this.clearError();
            this.showLoading(true);

            this.ws.send(JSON.stringify({
                type: 'torrentFile',
                fileData: base64String
            }));
        };
        reader.onerror = () => {
            this.showError('Could not read .torrent file');
        };

        reader.readAsArrayBuffer(file);
    }
    
    refreshToggleButton() {
        // Assuming you might have a dedicated toggle button elsewhere,
        // update its appearance based on the currently selected subtitle track.
        // Here, we reference the overlay dropdown.
        const overlaySubSelect = document.getElementById('overlaySubSelect');
        const selectedIndex = parseInt(overlaySubSelect.value, 10);
        const trackEl = this.subtitleTracks[selectedIndex];
    
        // For example, if you have a button (id="toggleSubtitlesBtn") to reflect the state:
        const toggleSubBtn = document.getElementById('toggleSubtitlesBtn');
        if (toggleSubBtn && trackEl && trackEl.track && trackEl.track.mode === 'showing') {
            toggleSubBtn.classList.remove('subtitles-off');
            toggleSubBtn.classList.add('subtitles-on');
            toggleSubBtn.textContent = 'Subtitles ON';
        } else if (toggleSubBtn) {
            toggleSubBtn.classList.remove('subtitles-on');
            toggleSubBtn.classList.add('subtitles-off');
            toggleSubBtn.textContent = 'Subtitles OFF';
        }
    }
    

    handleStreamClick() {
        const magnetLink = document.getElementById('magnetLink').value.trim();
        
        if (!magnetLink) {
            this.showError('Please enter a magnet link');
            return;
        }

        this.clearError();
        this.showLoading(true);
        this.ws.send(JSON.stringify({
            type: 'magnetLink',
            magnetLink: magnetLink
        }));
    }

    showLoading(show) {
        const loadingElement = document.getElementById('loadingStatus');
        const statusElement = document.getElementById('torrentStatus');
        loadingElement.style.display = show ? 'block' : 'none';
        if (show) {
            statusElement.style.display = 'none';
        }
    }

    handleVideoURL(data) {
        this.showLoading(false);

        const videoContainer = document.getElementById('videoContainer');
        videoContainer.style.display = 'block';
        const videoPlayer = document.getElementById('videoPlayer');
        videoPlayer.style.display = 'block';
        videoPlayer.src = data.url;
    
        // Remove any existing <track> elements from previous load
        const oldTracks = videoPlayer.querySelectorAll('track');
        oldTracks.forEach(t => t.remove());
    
        // Clear our track references
        this.subtitleTracks = [];
    
        // Update the overlay subtitle dropdown
        const overlaySubSelect = document.getElementById('overlaySubSelect');
        overlaySubSelect.innerHTML = '';  // Clear previous options
    
        for (let i = 0; i < data.subtitleCount; i++) {
            // Create the <track> element
            const track = document.createElement('track');
    
            // Use subtitle file name if available; otherwise fallback to a generic label.
            const subtitleLabel = (data.subtitleNames && data.subtitleNames[i])
                ? data.subtitleNames[i]
                : `Subtitle #${i + 1}`;
    
            track.kind = 'subtitles';
            track.label = subtitleLabel;
            track.srclang = 'en'; 
            track.src = `/subtitles/${data.fileId}/${i}`;
            track.default = (i === 0); // Make the first track default "on"
    
            videoPlayer.appendChild(track);
            this.subtitleTracks.push(track);
    
            // Also add <option> to the overlay dropdown
            const option = document.createElement('option');
            option.value = i.toString();
            option.textContent = subtitleLabel;
            overlaySubSelect.appendChild(option);
        }
    
        // If at least one track is found, select index=0 by default
        if (data.subtitleCount > 0) {
            overlaySubSelect.value = '0';
        }
    
        // Refresh the subtitle toggle button appearance if needed
        this.refreshToggleButton();
    
        videoPlayer.onerror = (e) => {
            console.error('Video error:', e);
            this.showError('Error playing video. Please try again.');
            videoPlayer.style.display = 'none';
        };
    
        videoPlayer.play().catch(e => {
            console.error('Autoplay failed:', e);
        });
    }
    
    showError(message) {
        this.showLoading(false);
        const errorElement = document.getElementById('error');
        errorElement.textContent = message;
    }

    clearError() {
        const errorElement = document.getElementById('error');
        errorElement.textContent = '';
    }

    updateStatus(data) {
        document.getElementById('downloadSpeed').textContent = this.formatSpeed(data.downloadSpeed);
        document.getElementById('uploadSpeed').textContent = this.formatSpeed(data.uploadSpeed);
        // Use "progressText" to match the HTML
        document.getElementById('progressText').textContent = (data.progress * 100).toFixed(2) + '%';
        
        // Update buffer health
        const video = document.getElementById('videoPlayer');
        let bufferHealth = 'N/A';
        if (video && video.buffered && video.buffered.length > 0) {
            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
            const secondsBuffered = bufferedEnd - video.currentTime;
            bufferHealth = secondsBuffered.toFixed(1) + 's';
        }
        document.getElementById('bufferHealth').textContent = bufferHealth;
        
        // Update peers
        document.getElementById('peers').textContent = data.peers;
        
        // Only update seeds and leechers if the corresponding elements exist
        const seedsElem = document.getElementById('seeds');
        if (seedsElem) {
            seedsElem.textContent = data.seeds;
        }
        const leechersElem = document.getElementById('leechers');
        if (leechersElem) {
            leechersElem.textContent = data.leechers;
        }
    }
    

    // We keep the original example's "formatSpeed" commented out or as needed
    formatSpeed(bytes) {
        // If bytes is not a valid number, default to 0
        if (!Number.isFinite(bytes)) {
          bytes = 0;
        }
      
        const units = ['B/s', 'kB/s', 'MB/s', 'GB/s'];
        let unitIndex = 0;
      
        // Keep dividing until under 1024 or we run out of units
        while (bytes >= 1024 && unitIndex < units.length - 1) {
          bytes /= 1024;
          unitIndex++;
        }
      
        // Use .toFixed(1) to show one decimal place
        return bytes.toFixed(1) + ' ' + units[unitIndex];
      }
      

    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            const video = document.getElementById('videoPlayer');
            if (!video || !video.src || !this.isConnected) return;

            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    if (video.paused) {
                        video.play().catch(err => {
                            console.error('Play failed:', err);
                            this.handleVideoError();
                        });
                    } else {
                        video.pause();
                    }
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    this.seekVideo(video, -this.seekStep);
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    this.seekVideo(video, this.seekStep);
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    video.volume = Math.min(1, video.volume + 0.1);
                    break;

                case 'ArrowDown':
                    e.preventDefault();
                    video.volume = Math.max(0, video.volume - 0.1);
                    break;

                case 'KeyF':
                    e.preventDefault();
                    this.toggleFullscreen(video);
                    break;

                case 'KeyM':
                    e.preventDefault();
                    video.muted = !video.muted;
                    break;
            }
        });
    }

    handleVideoError() {
        const video = document.getElementById('videoPlayer');
        if (video) {
            video.style.display = 'none';
        }
        this.showError('Video playback error. Please try refreshing the page.');
    }

    toggleFullscreen(video) {
        try {
            if (!document.fullscreenElement) {
                video.requestFullscreen().catch(err => {
                    console.error('Fullscreen failed:', err);
                });
            } else {
                document.exitFullscreen();
            }
        } catch (err) {
            console.error('Fullscreen error:', err);
            // Fallback for older browsers
            if (video.webkitRequestFullscreen) {
                video.webkitRequestFullscreen();
            } else if (video.mozRequestFullScreen) {
                video.mozRequestFullScreen();
            }
        }
    }

    isVideoPlayable() {
        return this.isConnected && document.getElementById('videoPlayer').readyState > 0;
    }

    seekVideo(video, seconds) {
        if (this.isVideoPlayable()) {
            const newTime = video.currentTime + seconds;
            video.currentTime = Math.max(0, Math.min(newTime, video.duration));
        }
    }

    cleanup() {
        const video = document.getElementById('videoPlayer');
        if (video) {
            video.pause();
            video.src = '';
            video.load();
        }
    }
}

// Instantiate the client on load
window.addEventListener('load', () => {
    new TorrentStreamClient();
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (window.torrentClient) {
        window.torrentClient.cleanup();
    }
});

window.addEventListener('beforeunload', () => {
    if (window.torrentClient) {
        console.log('Cleaning up WebTorrent before closing...');
        window.torrentClient.ws.send(JSON.stringify({ type: 'disconnect' }));
    }
});
