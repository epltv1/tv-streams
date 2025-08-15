const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

module.exports = async (req, res) => {
    const { filename } = req.query; // Get filename from URL (e.g., one.m3u8)
    console.log(`Requested filename: ${filename}`);

    if (!filename || !filename.endsWith('.m3u8')) {
        console.error('Invalid or missing filename');
        res.status(400).send('#EXTM3U\n#EXTINF:-1,Error\n#EXT-X-ENDLIST\n# Invalid or missing filename');
        return;
    }

    try {
        // Read streams.json
        const streamsPath = path.join(__dirname, '../public/streams.json');
        console.log(`Attempting to read streams.json from: ${streamsPath}`);
        let streams;
        try {
            const streamsData = await fs.readFile(streamsPath, 'utf8');
            streams = JSON.parse(streamsData);
        } catch (fileError) {
            console.error(`Failed to read or parse streams.json: ${fileError.message}`);
            res.status(500).send('#EXTM3U\n#EXTINF:-1,Error\n#EXT-X-ENDLIST\n# Failed to load stream configuration');
            return;
        }

        // Find the stream matching the filename
        const stream = streams.find(s => s.filename === filename);
        if (!stream) {
            console.error(`No stream found for filename: ${filename}`);
            res.status(404).send('#EXTM3U\n#EXTINF:-1,Error\n#EXT-X-ENDLIST\n# Stream not found');
            return;
        }

        console.log(`Found stream: ${JSON.stringify(stream)}`);
        const targetUrl = stream.sourceUrl;

        // Simple in-memory cache
        const cache = new Map();
        if (cache.has(filename)) {
            const cached = cache.get(filename);
            if (Date.now() - cached.timestamp < 30000) { // Cache for 30 seconds
                console.log(`Serving cached content for ${filename}`);
                res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
                res.setHeader('Access-Control-Allow-Origin', '*');
                return res.status(200).send(cached.content);
            }
        }

        // Launch headless browser
        console.log(`Launching Puppeteer for ${targetUrl}`);
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
                console.log(`Captured m3u8 link: ${m3u8Link}`);
            }
            request.continue();
        });

        // Navigate to the target URL
        console.log(`Navigating to: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await browser.close();

        if (!m3u8Link) {
            console.error('No m3u8 link found');
            throw new Error('No m3u8 link found');
        }

        // Fetch the m3u8 content
        console.log(`Fetching m3u8 content from: ${m3u8Link}`);
        const m3u8Response = await fetch(m3u8Link);
        if (!m3u8Response.ok) {
            throw new Error(`Failed to fetch m3u8: ${m3u8Response.status}`);
        }
        const m3u8Content = await m3u8Response.text();

        // Cache the result
        cache.set(filename, { content: m3u8Content, timestamp: Date.now() });

        // Set headers
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Cache-Control', 'no-cache');

        res.status(200).send(m3u8Content);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        res.status(500).send('#EXTM3U\n#EXTINF:-1,Error\n#EXT-X-ENDLIST\n# Error fetching stream');
    }
};
