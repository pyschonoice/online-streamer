import WebTorrent from 'webtorrent';

class TorrentManager {
    constructor() {
        this.client = new WebTorrent();
        this.torrents = new Map(); // Store active torrents
    }

    async addTorrent(magnetLink) {
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

                resolve({
                    success: true,
                    fileId,
                    fileName: videoFile.name
                });
            });
        });
    }

    async getVideoStream(fileId) {
        const videoFile = this.torrents.get(fileId);
        if (!videoFile) {
            return null;
        }
        return videoFile.createReadStream();
    }
}

export default TorrentManager; 