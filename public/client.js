class TorrentStreamClient {
    constructor() {
        this.ws = new WebSocket(`ws://${window.location.host}`);
        this.setupWebSocket();
        this.setupEventListeners();
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
        videoPlayer.src = data.url;
        videoPlayer.style.display = 'block';
        videoPlayer.play();
    }

    showError(message) {
        const errorElement = document.getElementById('error');
        errorElement.textContent = message;
    }

    clearError() {
        const errorElement = document.getElementById('error');
        errorElement.textContent = '';
    }
}

// Initialize the client when the page loads
window.addEventListener('load', () => {
    new TorrentStreamClient();
}); 