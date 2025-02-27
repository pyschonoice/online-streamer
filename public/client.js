class TorrentStreamClient {
    constructor() {
        this.ws = new WebSocket(`ws://${window.location.host}`);
        this.setupWebSocket();
        this.setupEventListeners();
        this.setupKeyboardControls();
        this.seekAmount = 10; // seconds to seek
    }

    setupWebSocket() {
        this.ws.onopen = () => {
            console.log('Connected to server');
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
            this.showError('Connection to server lost');
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
        this.ws.send(JSON.stringify({
            type: 'magnetLink',
            magnetLink: magnetLink
        }));
    }

    handleVideoURL(data) {
        const videoPlayer = document.getElementById('videoPlayer');
        
        // Remove any existing error listeners
        videoPlayer.removeEventListener('error', this.handleVideoError);
        
        // Add error handler
        this.handleVideoError = (e) => {
            console.error('Video error:', e);
            this.showError('Error playing video. Retrying...');
            
            // Optional: Implement retry logic
            setTimeout(() => {
                videoPlayer.load();
                videoPlayer.play().catch(err => {
                    console.error('Retry failed:', err);
                });
            }, 2000);
        };
        
        videoPlayer.addEventListener('error', this.handleVideoError);
        
        videoPlayer.src = data.url;
        videoPlayer.style.display = 'block';
        
        // Add event listeners for video loading
        videoPlayer.addEventListener('loadedmetadata', () => {
            console.log('Video metadata loaded');
        });

        videoPlayer.play().catch(e => {
            console.error('Autoplay failed:', e);
        });
    }

    showError(message) {
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

        // Update speed displays
        document.getElementById('downloadSpeed').textContent = 
            this.formatSpeed(data.downloadSpeed);
        document.getElementById('uploadSpeed').textContent = 
            this.formatSpeed(data.uploadSpeed);
        
        // Update peers
        document.getElementById('peers').textContent = data.peers;
        
        // Update progress
        document.getElementById('progress').textContent = 
            `${(data.progress * 100).toFixed(1)}%`;
        
        // Update buffer progress
        document.getElementById('bufferProgress').style.width = 
            `${(data.buffer * 100).toFixed(1)}%`;
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
            if (!video) return;

            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    if (video.paused) {
                        video.play().catch(err => console.error('Play failed:', err));
                    } else {
                        video.pause();
                    }
                    break;
                    
                case 'ArrowLeft':
                    e.preventDefault();
                    this.seekVideo(video, -this.seekAmount);
                    break;
                    
                case 'ArrowRight':
                    e.preventDefault();
                    this.seekVideo(video, this.seekAmount);
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
            }
        });
    }

    seekVideo(video, amount) {
        if (video.readyState > 0) {
            const newTime = video.currentTime + amount;
            video.currentTime = Math.max(0, Math.min(newTime, video.duration));
            console.log(`Seeking to: ${video.currentTime}`);
        }
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
}

// Initialize the client when the page loads
window.addEventListener('load', () => {
    new TorrentStreamClient();
}); 