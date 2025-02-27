class TorrentStreamClient {
    constructor() {
        this.ws = new WebSocket(`ws://${window.location.host}`);
        this.setupWebSocket();
        this.setupEventListeners();
        this.setupKeyboardControls();
        this.seekStep = 10;
        this.isConnected = false;
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
        
        // Setup video error handling
        videoPlayer.onerror = (e) => {
            console.error('Video error:', e);
            this.showError('Error playing video. Please try again.');
            videoPlayer.style.display = 'none';
        };

        videoPlayer.src = data.url;
        videoPlayer.style.display = 'block';
        
        videoPlayer.addEventListener('loadedmetadata', () => {
            console.log('Video metadata loaded');
        });

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

        // document.getElementById('downloadSpeed').textContent = 
        //     this.formatSpeed(data.downloadSpeed);
        // document.getElementById('uploadSpeed').textContent = 
        //     this.formatSpeed(data.uploadSpeed);
        document.getElementById('peers').textContent = data.peers;
        // document.getElementById('progress').textContent = 
        //     `${(data.progress * 100).toFixed(1)}%`;

        // if (data.buffer) {
        //     const bufferProgress = document.getElementById('bufferProgress');
        //     const bufferPercentage = document.getElementById('bufferPercentage');
    
        //     // Calculate buffer percentage correctly
        //     const bufferValue = Math.min(100, data.buffer * 100);
        //     bufferProgress.style.width = `${bufferValue}%`;
        //     bufferPercentage.textContent = `${bufferValue.toFixed(1)}%`;
    
        //     // Change buffer bar color based on buffer value
        //     if (bufferValue > 80) {
        //         bufferProgress.style.backgroundColor = '#4CAF50'; // Green (good buffer)
        //     } else if (bufferValue > 30) {
        //         bufferProgress.style.backgroundColor = '#FFA726'; // Orange (medium buffer)
        //     } else {
        //         bufferProgress.style.backgroundColor = '#F44336'; // Red (low buffer)
        //     }
        // }
    }

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

window.addEventListener('load', () => {
    new TorrentStreamClient();
});

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
