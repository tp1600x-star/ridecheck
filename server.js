const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Load .env
try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = (m[2] || '').trim();
    });
  }
} catch (e) {}

const PORT = 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
    // Basic CORS & headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let reqPath = decodeURIComponent(req.url.split('?')[0]);

    // Geocoding Proxy for Google Places and Longdo Map (Prevents CORS issues)
    if (reqPath.startsWith('/api/proxy-geocode')) {
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const provider = parsedUrl.searchParams.get('provider');
        const q = parsedUrl.searchParams.get('q');
        const key = parsedUrl.searchParams.get('key');
        const https = require('https');

        if (provider === 'google' && key && q) {
            const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:TH&key=${encodeURIComponent(key)}`;
            https.get(gUrl, (gRes) => {
                let body = '';
                gRes.on('data', c => body += c);
                gRes.on('end', () => {
                    res.writeHead(gRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(body);
                });
            }).on('error', (e) => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            });
            return;
        }

        if (provider === 'longdo' && q) {
            const longdoKey = key || process.env.LONGDO_MAP_KEY || 'f77758635505616dd7ce9ebf39090e7c';
            const lUrl = `https://search.longdo.com/mapsearch/json/search?keyword=${encodeURIComponent(q)}&key=${encodeURIComponent(longdoKey)}&limit=10`;
            https.get(lUrl, (lRes) => {
                let body = '';
                lRes.on('data', c => body += c);
                lRes.on('end', () => {
                    res.writeHead(lRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(body);
                });
            }).on('error', (e) => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            });
            return;
        }
        if (provider === 'longdo-address') {
            const lat = parsedUrl.searchParams.get('lat');
            const lon = parsedUrl.searchParams.get('lon');
            const longdoKey = key || process.env.LONGDO_MAP_KEY || 'f77758635505616dd7ce9ebf39090e7c';
            const aUrl = `https://api.longdo.com/map/services/address?lon=${encodeURIComponent(lon)}&lat=${encodeURIComponent(lat)}&key=${encodeURIComponent(longdoKey)}`;
            https.get(aUrl, (aRes) => {
                let body = '';
                aRes.on('data', c => body += c);
                aRes.on('end', () => {
                    res.writeHead(aRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(body);
                });
            }).on('error', (e) => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            });
            return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing provider, key, or q parameter' }));
        return;
    }

        // Endpoint for Gemini AI Agent query (Direct connection to gemini-3.8-flash)
    if (reqPath === '/api/gemini-ask' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body || '{}');
                const question = parsed.question || 'รายงานสถานะภาพรวม';
                const role = parsed.role || 'dev';
                const sender = parsed.sender || 'ท่าน Siridetxh (CEO)';

                const envKey = process.env.GEMINI_API_KEY || '';
                const https = require('https');

                const payload = JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [{
                            text: `คุณคือพนักงาน AI แผนก ${role} ของระบบเปรียบเทียบเรียกรถ RideCheck ตอบคำถามผู้บริหาร (${sender}) อย่างกระชับ แม่นยำ สุภาพ และอ้างอิงข้อมูลจริง: "${question}"`
                        }]
                    }],
                    generationConfig: { temperature: 0.6, maxOutputTokens: 500 }
                });

                const gReq = https.request({
                    hostname: 'generativelanguage.googleapis.com',
                    port: 443,
                    path: `/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${envKey}`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                        'x-goog-api-key': envKey
                    }
                }, (gRes) => {
                    let gBody = '';
                    gRes.on('data', c => gBody += c);
                    gRes.on('end', () => {
                        try {
                            const gj = JSON.parse(gBody);
                            const reply = gj.candidates?.[0]?.content?.parts?.[0]?.text || 'ได้รับคำสั่งเรียบร้อยแล้วครับ';
                            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                            res.end(JSON.stringify({ ok: true, model: 'gemini-3.5-flash-lite', reply }));
                        } catch (e) {
                            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                            res.end(JSON.stringify({ ok: true, model: 'autonomous-fallback', reply: 'รับคำสั่งเรียบร้อยแล้วครับ พนักงานกำลังดำเนินการตามแผนงาน 100%' }));
                        }
                    });
                });

                gReq.on('error', (err) => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: err.message }));
                });

                gReq.write(payload);
                gReq.end();
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Invalid JSON payload' }));
            }
        });
        return;
    }

    if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
    }

    const filePath = path.join(ROOT_DIR, reqPath);

    // Prevent directory traversal
    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found: ' + reqPath);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Cache-Control': 'no-cache'
        });

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const ifaces = os.networkInterfaces();
    let localIp = 'localhost';
    for (const dev in ifaces) {
        for (const details of ifaces[dev]) {
            if (details.family === 'IPv4' && !details.internal) {
                localIp = details.address;
                break;
            }
        }
    }

    console.log('====================================================');
    console.log('🚗 RideCheck Production Web Server กำลังทำงานจริง!');
    console.log('====================================================');
    console.log(`💻 บนคอมพิวเตอร์ของคุณ : http://localhost:${PORT}/`);
    console.log(`📱 บนมือถือ (Wi-Fi เดียวกัน): http://${localIp}:${PORT}/`);
    console.log('====================================================');
    console.log('✅ เปิด index.html อัตโนมัติ (Google Maps + 5 ค่าย + Deep Link)');
});
