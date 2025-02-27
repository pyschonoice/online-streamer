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

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'magnetLink') {
                console.log('Received magnet link:', data.magnetLink);
                
                // Process the magnet link
                const result = await torrentManager.addTorrent(data.magnetLink);
                
                if (result.success) {
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
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Internal server error'
            }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Video streaming endpoint
app.get('/stream/:fileId', async (req, res) => {
    try {
        const stream = await torrentManager.getVideoStream(req.params.fileId);
        if (!stream) {
            return res.status(404).send('Video not found');
        }
        
        // Set appropriate headers
        res.writeHead(200, {
            'Content-Type': 'video/mp4'
        });
        
        // Pipe the video stream to response
        stream.pipe(res);
    } catch (error) {
        console.error('Streaming error:', error);
        res.status(500).send('Error streaming video');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 