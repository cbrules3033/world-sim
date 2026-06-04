import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { handleMessage, handleDisconnect } from './lobby.js';
import { sendMessage, MessageType } from './protocol.js';

const PORT = process.env.PORT || 3010;
const CLIENT_DIR = new URL('../client/', import.meta.url).pathname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(CLIENT_DIR, filePath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const playerIdMap = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try {
      handleMessage(ws, data.toString(), playerIdMap);
    } catch (err) {
      console.error('Message error:', err);
      sendMessage(ws, MessageType.ROOM_ERROR, { error: 'Invalid message' });
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws, playerIdMap);
  });

  ws.on('error', () => {
    handleDisconnect(ws, playerIdMap);
  });
});

server.listen(PORT, () => {
  console.log(`World Sim server running on http://localhost:${PORT}`);
});
