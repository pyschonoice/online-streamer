import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import TorrentManager from './torrentManager.js';
import srt2vtt from 'srt-to-vtt';
import { PassThrough } from 'stream'; // Native stream passthrough



// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files from public directory
app.use(express.static(join(__dirname, '../public')));

// Create torrent manager instance
const torrentManager = new TorrentManager();

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('Client connected');
    let currentFileId = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // =========== NEW: handle torrentFile ===============
            if (data.type === 'torrentFile') {
                console.log('Received .torrent file via WS');
                // 1) Decode from base64 -> Buffer
                const fileBuffer = Buffer.from(data.fileData, 'base64');
        
                // 2) Clean up any previously active torrent
                if (currentFileId) {
                  await torrentManager.cleanup(currentFileId);
                }
        
                // 3) Add the raw buffer to the TorrentManager
                const result = await torrentManager.addTorrentFile(fileBuffer, (status) => {
                  ws.send(JSON.stringify(status));
                });
        
                if (result.success) {
                    currentFileId = result.fileId;
                    // After adding the torrent and retrieving torrentData:
                    const torrentData = torrentManager.torrents.get(result.fileId);
                    const subtitleFiles = torrentData?.subtitleFiles || [];
                    const subtitleCount = subtitleFiles.length;
                    // Build an array of subtitle file names
                    const subtitleNames = subtitleFiles.map(file => file.name);

                    ws.send(JSON.stringify({
                        type: 'videoURL',
                        url: `/stream/${result.fileId}`,
                        fileName: result.fileName,
                        fileId: result.fileId,
                        subtitleCount,
                        subtitleNames  // <-- include the names in the response
                    }));

                    
                } else {
                  ws.send(JSON.stringify({
                    type: 'error',
                    message: result.error || 'Error adding torrent buffer'
                  }));
                }

            } else if (data.type === 'magnetLink') {
                // (unchanged existing logic)
                console.log('Received magnet link:', data.magnetLink);

                if (currentFileId) {
                    await torrentManager.cleanup(currentFileId);
                }

                const result = await torrentManager.addTorrent(
                    data.magnetLink,
                    (status) => ws.send(JSON.stringify(status))
                );

                if (result.success) {
                    currentFileId = result.fileId;
                    // After adding the torrent and retrieving torrentData:
                    const torrentData = torrentManager.torrents.get(result.fileId);
                    const subtitleFiles = torrentData?.subtitleFiles || [];
                    const subtitleCount = subtitleFiles.length;
                    // Build an array of subtitle file names
                    const subtitleNames = subtitleFiles.map(file => file.name);

                    ws.send(JSON.stringify({
                        type: 'videoURL',
                        url: `/stream/${result.fileId}`,
                        fileName: result.fileName,
                        fileId: result.fileId,
                        subtitleCount,
                        subtitleNames  // <-- include the names in the response
                    }));
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ type: 'error', message: 'Internal server error' }));
        }
    });

    ws.on('close', async () => {
        console.log('Client disconnected');
        if (currentFileId) {
            await torrentManager.cleanup(currentFileId);
        }
    });
});



// Video streaming endpoint
app.get('/stream/:fileId', async (req, res) => {
    let stream = null;
    let rangeStream = null;

    try {
        stream = await torrentManager.getVideoStream(req.params.fileId);
        if (!stream) {
            return res.status(404).send('Video not found');
        }
        
        // Get the video file size
        const videoFile = torrentManager.getVideoFile(req.params.fileId);
        const fileSize = videoFile.length;
        
        // Parse Range header
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4'
            });
            
            // Create stream for specific range
            rangeStream = videoFile.createReadStream({ start, end });
            
            // Handle stream errors
            rangeStream.on('error', (error) => {
                console.error('Range stream error:', error);
                if (!res.headersSent) {
                    res.status(500).send('Streaming error occurred');
                }
            });

            rangeStream.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4'
            });

            // Handle stream errors
            stream.on('error', (error) => {
                console.error('Stream error:', error);
                if (!res.headersSent) {
                    res.status(500).send('Streaming error occurred');
                }
            });

            stream.pipe(res);
        }

        // Handle client disconnect
        req.on('close', () => {
            console.log('Client disconnected from stream');
            if (rangeStream) {
                rangeStream.destroy();
            }
            if (stream) {
                stream.destroy();
            }
        });

    } catch (error) {
        console.error('Streaming error:', error);
        if (!res.headersSent) {
            res.status(500).send('Error streaming video');
        }
        if (rangeStream) {
            rangeStream.destroy();
        }
        if (stream) {
            stream.destroy();
        }
    }
});


app.get('/subtitles/:fileId/:index', async (req, res) => {
    try {
        const fileId = req.params.fileId;
        const index = parseInt(req.params.index, 10);

        // 1) Look up the torrent data
        const data = torrentManager.torrents.get(fileId);
        if (!data) {
            return res.status(404).send('Torrent data not found');
        }
        const subtitleFile = data.subtitleFiles[index];
        if (!subtitleFile) {
            return res.status(404).send('Subtitle file not found');
        }

        // 2) Check if subtitle is .srt or .vtt
        const isSrt = /\.srt$/i.test(subtitleFile.name);
        if (isSrt) {
            // Serve as WebVTT by piping through srt-to-vtt
            res.setHeader('Content-Type', 'text/vtt');

            const passThrough = new PassThrough();
            // If you need error handling:
            passThrough.on('error', (err) => {
                console.error('Subtitle conversion error:', err);
            });

            subtitleFile.createReadStream()
                .pipe(srt2vtt())   // Convert SRT → VTT
                .pipe(passThrough)
                .pipe(res);

        } else {
            // If already .vtt, just stream it directly
            res.setHeader('Content-Type', 'text/vtt');
            subtitleFile.createReadStream().pipe(res);
        }

    } catch (error) {
        console.error('Subtitle serving error:', error);
        res.status(500).send('Error serving subtitle');
    }
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 

