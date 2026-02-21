import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3001;
const BASE_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.wav': 'audio/wav'
};

const server = http.createServer((req, res) => {
    console.log(`[REQ] ${req.url}`);

    // Default to sandbox inside the engine root
    let filePath = req.url === '/' ? '/sandbox.html' : req.url;

    // Remove query params
    filePath = filePath.split('?')[0];

    // Build absolute path
    const absPath = path.join(BASE_DIR, filePath);
    const extname = String(path.extname(absPath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(absPath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Static server running at http://127.0.0.1:${PORT}/`);
    console.log(`Hosting ECS Sandbox: http://127.0.0.1:${PORT}/sandbox.html`);
});
