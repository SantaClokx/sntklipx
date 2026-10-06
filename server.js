const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());

const tempDir = '/tmp';
function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    exec(`yt-dlp ${args.join(' ')}`, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

app.get('/', (req, res) => res.send('sntklipx API running'));

app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing URL' });
  try {
    const out = await runYtDlp(['-J', '--no-playlist', `"${url}"`]);
    const info = JSON.parse(out);
    res.json({ title: info.title, thumbnail: info.thumbnail, duration: info.duration });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/download', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing URL' });
  const file = path.join(tempDir, `${crypto.randomBytes(6).toString('hex')}.mp4`);
  try {
    await runYtDlp(['-f', 'best[ext=mp4]/best', '--no-playlist', '-o', file, `"${url}"`]);
    res.setHeader('Content-Disposition', 'attachment; filename="sntklipx.mp4"');
    res.setHeader('Content-Type', 'video/mp4');
    const stream = fs.createReadStream(file);
    stream.pipe(res);
    stream.on('close', () => fs.unlink(file, () => {}));
  } catch (e) { res.status(500).json({ error: 'Download failed' }); }
});

app.listen(process.env.PORT || 3000);
