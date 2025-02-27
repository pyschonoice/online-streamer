import WebTorrent from 'webtorrent';

class TorrentManager {
    constructor() {
        this.client = new WebTorrent();
        this.torrents = new Map(); // Store active torrents
        this.infoHashes = new Set(); // Track active torrent hashes
    }

    async addTorrent(magnetLink, statusCallback) {
        return new Promise((resolve, reject) => {
            try {
                // Parse the magnet link to get the info hash
                const match = magnetLink.match(/btih:([a-fA-F0-9]+)/i);
                if (!match) {
                    resolve({
                        success: false,
                        error: 'Invalid magnet link'
                    });
                    return;
                }

                const infoHash = match[1].toLowerCase();
                
                // Check if this torrent is already being downloaded
                if (this.infoHashes.has(infoHash)) {
                    // Find existing torrent file
                    for (const [fileId, file] of this.torrents.entries()) {
                        if (file.torrent && file.torrent.infoHash === infoHash) {
                            resolve({
                                success: true,
                                fileId,
                                fileName: file.name
                            });
                            return;
                        }
                    }
                }

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
                    videoFile.torrent = torrent; // Store torrent reference
                    this.torrents.set(fileId, videoFile);
                    this.infoHashes.add(infoHash);

                    // Setup status updates
                    if (statusCallback) {
                        const interval = setInterval(() => {
                            statusCallback({
                                type: 'status',
                                downloadSpeed: torrent.downloadSpeed,
                                uploadSpeed: torrent.uploadSpeed,
                                progress: torrent.progress,
                                peers: torrent.numPeers,
                                buffer: {
                                    progress: torrent.progress,
                                    downloaded: torrent.downloaded,
                                    downloadSpeed: torrent.downloadSpeed,
                                    length: torrent.length,
                                    pieces: torrent.pieces.length > 0 ? 
                                        torrent.pieces.filter(piece => piece).length / torrent.pieces.length : 0
                                }
                            });
                        }, 1000);

                        videoFile.statusInterval = interval;
                        videoFile.infoHash = infoHash;
                    }

                    resolve({
                        success: true,
                        fileId,
                        fileName: videoFile.name
                    });
                });

            } catch (error) {
                console.error('Error adding torrent:', error);
                resolve({
                    success: false,
                    error: 'Failed to add torrent'
                });
            }
        });
    }

    async getVideoStream(fileId) {
        const videoFile = this.torrents.get(fileId);
        if (!videoFile) {
            return null;
        }
        const stream = videoFile.createReadStream();
        
        // Add error handler to the stream
        stream.on('error', (error) => {
            console.error('Stream error in TorrentManager:', error);
            if (stream.destroy) stream.destroy();
        });

        return stream;
    }

    cleanup(fileId) {
        const videoFile = this.torrents.get(fileId);
        if (videoFile) {
            if (videoFile.statusInterval) {
                clearInterval(videoFile.statusInterval);
            }
            if (videoFile.torrent) {
                try {
                    videoFile.torrent.destroy();
                } catch (error) {
                    console.error('Error destroying torrent:', error);
                }
            }
            if (videoFile.infoHash) {
                this.infoHashes.delete(videoFile.infoHash);
            }
            this.torrents.delete(fileId);
        }
    }
}

export default TorrentManager; 