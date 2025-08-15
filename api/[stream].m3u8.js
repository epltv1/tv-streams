const puppeteer = require('puppeteer');

module.exports = async (req, res) => {
    const { stream } = req.query; // Get stream ID from URL (e.g., 941480)
    if (!stream) {
        res.status(400).send('#EXTM3U\n#EXTINF:-1,Error\n#EXT-X-ENDLIST\n# Missing stream ID');
        return;
    }

    // Use a fixed MAC address or make it configurable via query params
    const mac = req.query.mac || '00:1A:79:3A:93:FD'; // Default MAC
    const targetUrl = `http://main.light-ott.net:80/play/live.php?mac=${mac}&stream=${stream}&extension=m3u8`;

    try {
        // Launch headless browser
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        let m3u8Link = '';

        // Intercept network requests to capture m3u8 links
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.url().endsWith('.m3u8')) {
                m3u8Link = request.url();
            }
            request.continue();
        });

        // Navigate to the target URL
        await page.goto(targetUrl, { waitUntil: 'networkidle2' });

        // Close the browser
        await browser.close();

        if (!m3u8Link) {
            throw new Error('No m3u8 link found');
        }

        // Fetch the m3u8 content to proxy it
        const m3u8Response = await fetch(m3u8Link);
        const m3u8Content = await m3u8Response.text();

        // Set headers to serve as an m3u8 file and avoid CORS
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Cache-Control', 'no-cache');

        // Send the m3u8 content
        res.status(200).send(m3u8Content);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('#EXTM3U\n#EXTINF:-1,Error\n#EXT-X-ENDLIST\n# Error fetching stream');
    }
};
