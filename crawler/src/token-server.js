/**
 * Token 接收服务器（与 Chrome 扩展配合使用）
 *
 * 接收扩展发送的 tokens，写入 boss-config.json
 *
 * 用法： node src/token-server.js
 *    然后浏览器加载 extensions/chrome-extension 目录作为扩展
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8892;
const CONFIG_FILE = path.join(__dirname, '..', 'data', 'config.json');
let lastSaved = { cookie: '', zp_token: '', token: '' };

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/update-token') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { cookie, zp_token, token } = JSON.parse(body);

        // 去重
        if (cookie === lastSaved.cookie && zp_token === lastSaved.zp_token && token === lastSaved.token) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, msg: 'no change' }));
          return;
        }
        lastSaved = { cookie, zp_token, token };

        // 写入文件
        const config = { cookie, zp_token, token };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');

        const now = new Date().toLocaleTimeString();
        console.log(`[${now}] ✓ Tokens 已更新`);
        console.log(`  cookie: ${cookie.substring(0, 60)}...`);
        console.log(`  zp_token: ${zp_token}`);
        console.log(`  token: ${token}\n`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log('=====================================================');
  console.log('  BOSS直聘 Token 接收服务器');
  console.log(`  监听端口: ${PORT}`);
  console.log(`  输出文件: ${CONFIG_FILE}`);
  console.log('=====================================================');
  console.log('');
  console.log('使用步骤:');
  console.log('1. 打开 Chrome → chrome://extensions');
  console.log('2. 开启"开发者模式" → "加载已解压的扩展"');
  console.log(`   选择 extensions/chrome-extension 目录`);
  console.log('3. 在浏览器中打开 BOSS直聘（需已登录）');
  console.log('4. 刷新页面，tokens 会自动捕获');
  console.log('');
  console.log('保持本窗口运行，最小化即可');
  console.log('--- 等待 tokens... ---\n');
});
