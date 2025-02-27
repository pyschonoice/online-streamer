import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import TorrentManager from './torrentManager.js';

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

            if (data.type === 'magnetLink') {
                console.log('Received magnet link:', data.magnetLink);
                
                // Ensure previous torrent is cleaned up before adding a new one
                if (currentFileId) {
                    await torrentManager.cleanup(currentFileId);
                }

                const result = await torrentManager.addTorrent(
                    data.magnetLink,
                    (status) => ws.send(JSON.stringify(status))
                );

                if (result.success) {
                    currentFileId = result.fileId;
                    ws.send(JSON.stringify({
                        type: 'videoURL',
                        url: `/stream/${result.fileId}`,
                        fileName: result.fileName
                    }));
                } else {
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: result.error
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 

