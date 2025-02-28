// client.js
class TorrentStreamClient {
    constructor() {
        this.ws = new WebSocket(`ws://${window.location.host}`);
        this.setupWebSocket();
        this.setupEventListeners();
        this.setupKeyboardControls();
        this.seekStep = 10;
        this.isConnected = false;

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
    
        // 1) Subtitle track dropdown
        const subSelect = document.getElementById('subTrackSelect');
        subSelect.addEventListener('change', () => {
            // If user picks a different track from the dropdown,
            // disable all except the selected one
            const selectedIndex = parseInt(subSelect.value, 10);
            
            // IMPORTANT: use `trackEl.track.mode` to show/hide
            this.subtitleTracks.forEach((trackEl, i) => {
                trackEl.track.mode = (i === selectedIndex) ? 'showing' : 'disabled';
            });

            this.refreshToggleButton();
        });
    
        // 2) Toggle Subtitles button
        const toggleSubBtn = document.getElementById('toggleSubtitlesBtn');
        toggleSubBtn.addEventListener('click', () => {
            const selectedIndex = parseInt(subSelect.value, 10);
            const trackEl = this.subtitleTracks[selectedIndex];
            if (!trackEl) return;
            
            // Use trackEl.track.mode to toggle subtitles
            if (trackEl.track.mode === 'showing') {
                trackEl.track.mode = 'disabled';
            } else {
                trackEl.track.mode = 'showing';
            }
            
            this.refreshToggleButton();
        });


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
        const toggleSubBtn = document.getElementById('toggleSubtitlesBtn');
        const subSelect = document.getElementById('subTrackSelect');
        const selectedIndex = parseInt(subSelect.value, 10);
        const trackEl = this.subtitleTracks[selectedIndex];

        // Again, check trackEl.track.mode
        if (trackEl && trackEl.track && trackEl.track.mode === 'showing') {
            toggleSubBtn.classList.remove('subtitles-off');
            toggleSubBtn.classList.add('subtitles-on');
            toggleSubBtn.textContent = 'Toggle Subtitles (ON)';
        } else {
            toggleSubBtn.classList.remove('subtitles-on');
            toggleSubBtn.classList.add('subtitles-off');
            toggleSubBtn.textContent = 'Toggle Subtitles (OFF)';
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
        const videoPlayer = document.getElementById('videoPlayer');
        videoPlayer.style.display = 'block';
        videoPlayer.src = data.url;

         // ===== NEW: Make the subtitle controls visible =====
        const subtitleControls = document.querySelector('.subtitle-controls');
        subtitleControls.style.display = 'flex'; 

        // Remove any existing <track> elements from previous load
        const oldTracks = videoPlayer.querySelectorAll('track');
        oldTracks.forEach(t => t.remove());

        // Clear our track references
        this.subtitleTracks = [];

        // 2) Build new <track> elements if we have subtitleCount
        const subSelect = document.getElementById('subTrackSelect');
        subSelect.innerHTML = '';  // Clear old <option>s

        for (let i = 0; i < data.subtitleCount; i++) {
            // Create the <track> element
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = `Subtitle #${i+1}`;
            track.srclang = 'en'; 
            track.src = `/subtitles/${data.fileId}/${i}`;
            track.default = (i === 0); // Make the first track default "on"

            videoPlayer.appendChild(track);

            // Keep a reference so we can toggle them later
            this.subtitleTracks.push(track);

            // Also add <option> to the <select> so user can pick
            const option = document.createElement('option');
            option.value = i.toString();
            option.textContent = `Subtitle #${i+1}`;
            subSelect.appendChild(option);
        }

        // If at least one track is found, select index=0 by default
        if (data.subtitleCount > 0) {
            subSelect.value = '0';
        }

        // Ensure the button color is correct
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
        const statusElement = document.getElementById('torrentStatus');
        statusElement.style.display = 'block';
        document.getElementById('peers').textContent = data.peers;
    }

    // We keep the original example's "formatSpeed" commented out or as needed
    formatSpeed(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let value = bytes;
        let unitIndex = 0;
        
        while (value > 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }
        
        return `${value.toFixed(1)} ${units[unitIndex]}/s`;
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
