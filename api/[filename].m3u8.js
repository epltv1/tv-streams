const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

module.exports = async (req, res) => {
    const { filename } = req.query; // Get filename from URL (e.g., one.m3u8)
    if (!filename || !filename.endsWith('.m3u8')) {
        res.status(400).send('#EXTM3U\n#EXTINF:-1,Error\n#EXT-X-ENDLIST\n# Invalid filename');
        return;
    }

    try {
        // Read streams.json
        const streamsPath = path.join(__dirname, '../public/streams.json');
        const streamsData = await fs.readFile(streamsPath, 'utf8');
        const streams = JSON.parse(streamsData);

        // Find the stream matching the filename
        const stream = streams.find(s => s.filename === filename);
        if (!stream) {
            res.status(404).send('#EXTM3U\n#EXTINF:-1,Error\n#EXT-X-ENDLIST\n# Stream not found');
            return;
        }

        const targetUrl = stream.sourceUrl;

        // Launch headless browser
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        let m3u8Link = '';

        // Intercept network requests
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.url().endsWith('.m3u8')) {
                m3u8Link = request.url();
            }
            request.continue();
        });

        // Navigate to the target URL
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });
        await browser.close();

        if (!m3u8Link) {
            throw new Error('No m3u8 link found');
        }

        // Fetch the m3u8 content
        const m3u8Response = await fetch(m3u8Link);
        const m3u8Content = await m3u8Response.text();

        // Set headers
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Cache-Control', 'no-cache');

        res.status(200).send(m3u8Content);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('#EXTM3U\n#EXTINF:-1,Error\n#EXT-X-ENDLIST\n# Error fetching stream');
    }
};
