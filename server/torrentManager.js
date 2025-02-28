import WebTorrent from 'webtorrent';
import path from 'path';
import os from 'os';
import { promises as fsp } from 'fs';

const { readdir, lstat, unlink, rmdir } = fsp;

class TorrentManager {
  constructor() {
    this.client = new WebTorrent();
    this.torrents = new Map();       // Will now store { torrent, videoFile }
    this.statusIntervals = new Map();
  }

  async addTorrent(magnetLink, statusCallback) {
    return new Promise((resolve) => {
      // If you only want one torrent at a time, you can still destroy the old ones here:
      // this.client.torrents.forEach(t => t.destroy());

      this.client.add(magnetLink, (torrent) => {
        // Pick the largest video file
        const videoFile = torrent.files.reduce((largest, file) => {
          const isVideo = /\.(mp4|webm|mkv)$/i.test(file.name);
          return isVideo && (!largest || file.length > largest.length) ? file : largest;
        }, null);

        if (!videoFile) {
          torrent.destroy();
          return resolve({ success: false, error: 'No video file found in torrent' });
        }
        
          // 2) Find all subtitle files
        const subtitleFiles = torrent.files.filter(file => {
            return /\.(srt|vtt)$/i.test(file.name);
        });

        // Create a base64 fileId
        const fileId = Buffer.from(videoFile.name).toString('base64');

        // IMPORTANT: Store both the torrent object and the videoFile
        //this.torrents.set(fileId, { torrent, videoFile });
        
        this.torrents.set(fileId, { torrent, videoFile, subtitleFiles });
        // Start periodic status updates
        this.setupStatusUpdates(torrent, fileId, statusCallback);

        resolve({
          success: true,
          fileId,
          fileName: videoFile.name
        });
      });
    });
  }

   // =============== NEW: Add .torrent buffer directly ===============
   async addTorrentFile(torrentBuffer, statusCallback) {
    return new Promise((resolve) => {
      this.client.add(torrentBuffer, (torrent) => {
        // 1) Pick the largest video file
        const videoFile = torrent.files.reduce((largest, file) => {
          const isVideo = /\.(mp4|webm|mkv)$/i.test(file.name);
          return isVideo && (!largest || file.length > largest.length) ? file : largest;
        }, null);

        if (!videoFile) {
          torrent.destroy();
          return resolve({
            success: false,
            error: 'No video file found in torrent'
          });
        }

        // 2) Find subtitle files
        const subtitleFiles = torrent.files.filter(file => /\.(srt|vtt)$/i.test(file.name));

        // 3) Construct an ID from the video file name (or any logic you prefer)
        const fileId = Buffer.from(videoFile.name).toString('base64');

        // 4) Store references
        this.torrents.set(fileId, { torrent, videoFile, subtitleFiles });

        // 5) Start status updates
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
        progress: torrent.progress,
        peers: torrent.numPeers,
      };
      statusCallback(status);
    }, 1000);

    this.statusIntervals.set(fileId, interval);
  }

  getVideoFile(fileId) {
    const data = this.torrents.get(fileId);
    return data ? data.videoFile : null;
  }

  async getVideoStream(fileId, options = {}) {
    const data = this.torrents.get(fileId);
    if (!data) return null;

    const { videoFile } = data;
    const stream = videoFile.createReadStream(options);

    // Add error handler
    stream.on('error', (error) => {
      console.error('Stream error in TorrentManager:', error);
      stream.destroy();
    });
    return stream;
  }

  async cleanup(fileId) {
    console.log(`Cleaning up torrent for fileId: ${fileId}`);
    
    // 1) Destroy the torrent to release file locks
    const data = this.torrents.get(fileId);
    if (data && data.torrent) {
      console.log(`Destroying torrent instance for fileId: ${fileId}`);
      await new Promise((resolve) => data.torrent.destroy(resolve));
      this.torrents.delete(fileId);
    }

    // 2) Clear any status update intervals
    const interval = this.statusIntervals.get(fileId);
    if (interval) {
      clearInterval(interval);
      this.statusIntervals.delete(fileId);
    }

    // 3) (Optional) small delay to let OS close handles fully
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4) Recursively delete the entire /webtorrent directory
    const tempDir = path.join(os.tmpdir(), 'webtorrent');
    try {
      await deleteFolderRecursive(tempDir);
      console.log(`Successfully removed: ${tempDir}`);
    } catch (err) {
      console.error('Error removing webtorrent directory:', err);
    }
  }
}

// Recursively deletes a folder and all its subfolders/files
async function deleteFolderRecursive(dirPath) {
  try {
    const items = await readdir(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stats = await lstat(fullPath);

      if (stats.isDirectory()) {
        await deleteFolderRecursive(fullPath);
        await rmdir(fullPath);
      } else {
        await unlink(fullPath);
      }
    }
    await rmdir(dirPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

export default TorrentManager;
