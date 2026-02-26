const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * FULLY WORKING FACEBOOK DOWNLOADER - TRIPLE FAILOVER VERSION
 * This version uses three different API routes to ensure success.
 */
async function facebookCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || "";
        const url = text.split(' ').slice(1).join(' ').trim();
        
        if (!url) {
            return await sock.sendMessage(chatId, { text: "⚠️ *Missing Link!* Use: `.fb https://fb.watch/...`" }, { quoted: message });
        }

        // 1. Initial UI Response
        await sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } });

        let videoUrl = null;
        let title = "Facebook Video";

        // --- PHASE 1: TRY API #1 (Botcahx Primary) ---
        try {
            const api1 = await axios.get(`https://api.botcahx.eu.org/api/dowloader/fbdown?url=${encodeURIComponent(url)}&apikey=btch-beta`);
            if (api1.data?.status && (api1.data.result?.url || api1.data.result?.media?.video_hd)) {
                videoUrl = api1.data.result?.media?.video_hd || api1.data.result?.url;
                title = api1.data.result?.title || title;
            }
        } catch (e) { console.log("API 1 failed..."); }

        // --- PHASE 2: TRY API #2 (Botcahx Secondary/V2) ---
        if (!videoUrl) {
            try {
                const api2 = await axios.get(`https://api.botcahx.eu.org/api/dowloader/fbdown2?url=${encodeURIComponent(url)}&apikey=btch-beta`);
                if (api2.data?.status) {
                    videoUrl = api2.data.result?.url || api2.data.result?.link;
                    title = api2.data.result?.title || title;
                }
            } catch (e) { console.log("API 2 failed..."); }
        }

        // --- PHASE 3: TRY API #3 (Global Scraper Fallback) ---
        if (!videoUrl) {
            try {
                // Using a common public alternative endpoint
                const api3 = await axios.get(`https://api.alyarchive.eu.org/api/fbdown?url=${encodeURIComponent(url)}`);
                if (api3.data?.status) {
                    videoUrl = api3.data.result?.url || api3.data.result?.data?.[0]?.url;
                }
            } catch (e) { console.log("API 3 failed..."); }
        }

        // 2. Final Check before downloading
        if (!videoUrl) {
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
            return await sock.sendMessage(chatId, { 
                text: "❌ *All download servers are currently busy.* \n\nThis usually happens with private videos or temporary API outages. Please try again in a few minutes." 
            }, { quoted: message });
        }

        // 3. Prepare for Download
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const tempPath = path.join(tmpDir, `fb_${Date.now()}.mp4`);

        // 4. THE 403-BYPASS STREAM
        const writer = fs.createWriteStream(tempPath);
        const response = await axios({
            method: 'get',
            url: videoUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
                'Referer': 'https://www.facebook.com/',
                'Range': 'bytes=0-' 
            },
            timeout: 80000 // Extended timeout for large videos
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', (err) => {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                reject(err);
            });
        });

        // 5. Success! Send the video
        const stats = fs.statSync(tempPath);
        if (stats.size > 0) {
            await sock.sendMessage(chatId, {
                video: fs.readFileSync(tempPath),
                mimetype: "video/mp4",
                caption: `✅ *Facebook Video Downloaded*\n\n📝 *Title:* ${title}\n⚖️ *Size:* ${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
            }, { quoted: message });

            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        }

        // 6. Cleanup
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    } catch (error) {
        console.error('FINAL FB ERROR:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ *System Error:* ${error.message.includes('403') ? 'Facebook blocked the connection (403).' : 'The video could not be processed.'}` 
        }, { quoted: message });
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    }
}

module.exports = facebookCommand;
