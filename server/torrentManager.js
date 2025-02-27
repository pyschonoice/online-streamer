import WebTorrent from 'webtorrent';

class TorrentManager {
    constructor() {
        this.client = new WebTorrent();
        this.torrents = new Map(); // Store active torrents
        this.statusIntervals = new Map(); // Store status update intervals
    }

    async addTorrent(magnetLink, statusCallback) {
        return new Promise((resolve, reject) => {
            this.client.add(magnetLink, (torrent) => {
                // Find the largest video file
                const videoFile = torrent.files.reduce((largest, file) => {
                    const isVideo = /\.(mp4|webm|mkv)$/i.test(file.name);
                    return isVideo && (!largest || file.length > largest.length) ? file : largest;
                }, null);

                if (!videoFile) {
                    torrent.destroy();
                    resolve({
                        success: false,
                        error: 'No video file found in torrent'
                    });
                    return;
                }

                const fileId = Buffer.from(videoFile.name).toString('base64');
                this.torrents.set(fileId, videoFile);

                // Setup status updates
                this.setupStatusUpdates(torrent, fileId, statusCallback);

                resolve({
                    success: true,
                    fileId,
                    fileName: videoFile.name
                });
            });
        });
    }

    setupStatusUpdates(torrent, fileId, statusCallback) {
        const interval = setInterval(() => {
            const status = {
                type: 'status',
                downloadSpeed: torrent.downloadSpeed,
                uploadSpeed: torrent.uploadSpeed,
                progress: torrent.progress,
                peers: torrent.numPeers,
                buffer: torrent.pieces.length > 0 ? 
                    torrent.pieces.filter(piece => piece).length / torrent.pieces.length : 0
            };
            statusCallback(status);
        }, 1000);

        this.statusIntervals.set(fileId, interval);
    }

    getVideoFile(fileId) {
        return this.torrents.get(fileId);
    }

    async getVideoStream(fileId, options = {}) {
        const videoFile = this.torrents.get(fileId);
        if (!videoFile) {
            return null;
        }
        const stream = videoFile.createReadStream(options);
        
        // Add error handler to the stream
        stream.on('error', (error) => {
            console.error('Stream error in TorrentManager:', error);
            stream.destroy();
        });

        return stream;
    }

    cleanup(fileId) {
        const interval = this.statusIntervals.get(fileId);
        if (interval) {
            clearInterval(interval);
            this.statusIntervals.delete(fileId);
        }

        // Cleanup the torrent
        const videoFile = this.torrents.get(fileId);
        if (videoFile && videoFile.torrent) {
            videoFile.torrent.destroy();
            this.torrents.delete(fileId);
        }
    }
}

export default TorrentManager; 