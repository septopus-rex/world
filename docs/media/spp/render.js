#!/usr/bin/env node
/**
 * SPP 展开宣传片 —— 逐帧渲染 + 合成。
 *
 *   node docs/media/spp/render.js            # 两个画幅都出（默认 reveal.html）
 *   node docs/media/spp/render.js street.html # 换一支片子
 *   node docs/media/spp/render.js 16x9       # 只出横版
 *   node docs/media/spp/render.js 9x16 --crf 24
 *
 * 自带静态服务器（根 = 仓库根），所以场景页直接 fetch 项目里的
 * stylepack 与贴图 —— 粒子库改了，重跑这条命令视频就跟着变。
 * 依赖：全局 playwright（NODE_PATH=$(npm root -g)）+ ffmpeg。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');
const OUT = __dirname;
const SCENE_DIR = '/' + path.relative(ROOT, __dirname).split(path.sep).join('/');
const PORT = 7912;                       // 临时端口，随进程结束；不读 env.PORT
const FORMATS = { '16x9': [1920, 1080], '9x16': [1080, 1920] };
const MIME = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.png': 'image/png',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.glb': 'model/gltf-binary',
};

const args = process.argv.slice(2);
const SCENES = { 'reveal.html': 'spp-reveal', 'street.html': 'spp-street' };
const scene = args.find(a => /\.html$/.test(a)) || 'reveal.html';
const name = SCENES[scene] || path.basename(scene, '.html');
const want = args.filter(a => FORMATS[a]);
const crf = args.includes('--crf') ? args[args.indexOf('--crf') + 1] : '19';
const picked = want.length ? want : Object.keys(FORMATS);

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('nope');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  const { chromium } = require('playwright');
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch();

  for (const fmt of picked) {
    const [W, H] = FORMATS[fmt];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-${fmt}-`));
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => console.log('PAGE EXC:', e.message));
    await page.goto(`http://127.0.0.1:${PORT}${SCENE_DIR}/${scene}?w=${W}&h=${H}`);
    await page.waitForFunction(() => window.READY === true, null, { timeout: 30000 });
    const total = await page.evaluate(() => window.TOTAL);

    const t0 = Date.now();
    for (let f = 0; f < total; f++) {
      const data = await page.evaluate((n) => {
        window.renderFrame(n);
        return document.getElementById('c').toDataURL('image/png');
      }, f);
      fs.writeFileSync(path.join(dir, `f${String(f).padStart(4, '0')}.png`),
        Buffer.from(data.split(',')[1], 'base64'));
      if (f % 120 === 0) process.stdout.write(`  ${fmt} ${f}/${total}\n`);
    }
    await page.close();

    const mp4 = path.join(OUT, `${name}-${fmt}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60',
      '-i', path.join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-crf', crf, '-preset', 'slow', '-movflags', '+faststart', mp4], { stdio: 'inherit' });
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`  ${fmt} → ${mp4}  (${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  await browser.close();
  server.close();
})();
