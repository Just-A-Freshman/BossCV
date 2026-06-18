/**
 * Boss直聘岗位信息爬虫 v7
 *
 * 策略：
 * 1. 内嵌 Token 接收服务器，从 Chrome 扩展获取认证 tokens
 * 2. 搜索 API 获取岗位列表（含 securityId）
 * 3. 详情 API 获取完整岗位描述（按页间隔请求，绕过 WAF）
 * 4. 断点续爬（已获取的不会重复请求）
 *
 * 使用： node src/scraper.js（单进程，单终端）
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// ============================================================
// 配置区（优先级：settings.json > 内置默认值）
// ============================================================
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

const DEFAULTS = {
  apiParams: {
    city: '101280100',
    jobType: '1902',
    query: 'Agent',
    pageSize: 15,
    scene: 1,
  },
  maxPages: 10,
  delayBetweenPages: 6000,   // 翻页间隔(ms)
  delayBetweenDetails: 5000, // 详情间隔(ms)
  retryMax: 3,               // 详情 API 失败重试次数
  retryDelay: 8000,          // 重试间隔基础值(ms)
  configFile: path.join(__dirname, '..', 'data', 'config.json'),
  outputFile: path.join(__dirname, '..', 'data', 'jobs.json'),
  progressFile: path.join(__dirname, '..', 'data', 'progress.json'),
  tokenServerPort: 8892,
};

// ============================================================
// 项目管理和全局岗位池
// ============================================================
const PROJECTS_DIR = path.join(__dirname, '..', 'data', 'projects');
const PROJECTS_INDEX = path.join(PROJECTS_DIR, 'index.json');
const POOL_FILE = path.join(PROJECTS_DIR, 'pool.json');
let jobPool = {};
let currentProjectId = null;
let projectIndex = [];

function initProjectDir() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    fs.writeFileSync(PROJECTS_INDEX, '[]', 'utf-8');
    fs.writeFileSync(POOL_FILE, '{}', 'utf-8');
    console.log('[项目] 初始化 projects 目录\n');
  }
}

function loadPool() {
  if (fs.existsSync(POOL_FILE)) {
    try { jobPool = JSON.parse(fs.readFileSync(POOL_FILE, 'utf-8')); } catch {}
  }
}

function savePool() {
  fs.writeFileSync(POOL_FILE, JSON.stringify(jobPool), 'utf-8');
}

function loadProjectIndex() {
  if (!fs.existsSync(PROJECTS_INDEX)) return [];
  try { return JSON.parse(fs.readFileSync(PROJECTS_INDEX, 'utf-8')); } catch { return []; }
}

function saveProjectIndex(idx) {
  fs.writeFileSync(PROJECTS_INDEX, JSON.stringify(idx, null, 2), 'utf-8');
}

function genProjectId() {
  const ts = Date.now().toString(36).slice(-4);
  const rand = Math.random().toString(36).slice(2, 6);
  return 'proj-' + ts + rand;
}

// 用用户输入的项目名作为文件夹名，去掉 Windows 不允许的文件名字符
function sanitizeProjectName(name) {
  if (!name || !name.trim()) return genProjectId();
  let safe = name.trim().replace(/[\\/:*?"<>|]/g, '_');
  // 避免与之前随机 ID 格式冲突（proj-xxx），不允许单纯以 proj- 开头
  if (safe.match(/^proj-/i)) safe = 'p-' + safe;
  return safe || genProjectId();
}

function loadConfig() {
  let user = {};
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      user = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    } catch (e) {
      console.warn(`[配置] 无法解析 ${SETTINGS_FILE}，使用默认配置: ${e.message}`);
    }
  }
  // 浅合并顶层字段
  const result = { ...DEFAULTS, ...user };
  // 深合并 apiParams
  result.apiParams = { ...DEFAULTS.apiParams, ...(user.apiParams || {}) };
  return result;
}

function reloadConfig() {
  Object.assign(CONFIG, loadConfig());
  console.log(`[配置] 已重载: query="${CONFIG.apiParams.query}", city=${CONFIG.apiParams.city}`);
}

let CONFIG = loadConfig();

// ============================================================
// HTTP 工具
// ============================================================
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function genTraceId() {
  const h = Date.now().toString(16);
  const c = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let r = '';
  for (let i = 0; i < 10; i++) r += c[Math.floor(Math.random() * 62)];
  return 'F-' + h.slice(-6) + r;
}

function buildHeaders(referer) {
  // 优先读内存缓存，避免每次请求读磁盘
  let cfg = lastTokens;
  if (!cfg.cookie) {
    // 兜底：从磁盘加载（理论上只在 waitForTokens 阶段触发）
    cfg = JSON.parse(fs.readFileSync(CONFIG.configFile, 'utf-8'));
  }
  return {
    'Cookie': cfg.cookie,
    'zp_token': cfg.zp_token,
    'token': cfg.token,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    'Accept-Encoding': 'gzip, deflate',
    'Origin': 'https://www.zhipin.com',
    'X-Requested-With': 'XMLHttpRequest',
    'traceId': genTraceId(),
    'sec-ch-ua': '"Microsoft Edge";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Referer': referer,
  };
}

async function fetchAPI(url, opts = {}) {
  const headers = { ...buildHeaders(opts.referer || 'https://www.zhipin.com/web/geek/jobs') };
  const fo = { method: opts.method || 'GET', headers };
  if (opts.body) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; fo.body = opts.body; }
  const res = await fetch(url, fo);
  return await res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// 内嵌 Token 接收服务器（替代独立的 token-server.js）
// ============================================================
let tokenReady = false;
let lastTokens = { cookie: '', zp_token: '', token: '' };
let crawlRequested = false;
let stopRequested = false;
let poolSaved = true; // 追踪 pool 是否需写入

function startTokenServer() {
  const server = http.createServer((req, res) => {
    // 去掉 query string 做路由匹配，支持客户端缓存清除参数
    const pathname = req.url.indexOf('?') !== -1 ? req.url.split('?')[0] : req.url;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '0');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'POST' && pathname === '/update-token') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { cookie, zp_token, token } = JSON.parse(body);
          const changed = cookie !== lastTokens.cookie || zp_token !== lastTokens.zp_token || token !== lastTokens.token;
          if (changed) {
            lastTokens = { cookie, zp_token, token };
            fs.writeFileSync(CONFIG.configFile, JSON.stringify(lastTokens, null, 2), 'utf-8');
            tokenReady = true;
          }
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/update-settings') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (!data.apiParams) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: '缺少 apiParams' }));
            return;
          }
          let existing = {};
          if (fs.existsSync(SETTINGS_FILE)) {
            existing = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
          }
          const updated = { ...existing, apiParams: { ...existing.apiParams, ...data.apiParams } };
          fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
          reloadConfig();
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    if (pathname === '/start-crawl') {
      stopRequested = false;
      crawlRequested = true;
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (pathname === '/stop-crawl') {
      stopRequested = true;
      crawlRequested = false;
      // 更新项目状态为 idle
      if (currentProjectId) {
        const idx = loadProjectIndex();
        const p = idx.find(x => x.id === currentProjectId);
        if (p) { p.status = 'idle'; saveProjectIndex(idx); }
      }
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // ---- 项目管理 API ----
    if (pathname === '/projects' && req.method === 'GET') {
      const idx = loadProjectIndex();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.end(JSON.stringify(idx));
      return;
    }

    if (pathname === '/projects' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { name, apiParams } = JSON.parse(body);
          if (!name || !apiParams) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: '缺少 name 或 apiParams' })); return; }
          const id = sanitizeProjectName(name);
          // 检查索引中是否已有同名项目
          const idx = loadProjectIndex();
          if (idx.some(p => p.id === id)) {
            res.writeHead(409);
            res.end(JSON.stringify({ ok: false, error: '项目名称已存在: ' + name }));
            return;
          }
          const dir = path.join(PROJECTS_DIR, id);
          if (fs.existsSync(dir)) { res.writeHead(409); res.end(JSON.stringify({ ok: false, error: '项目目录冲突' })); return; }
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(apiParams, null, 2), 'utf-8');
          fs.writeFileSync(path.join(dir, 'progress.json'), JSON.stringify({ completedIds: [], allJobs: [] }), 'utf-8');
          idx.push({ id, name, apiParams, created: new Date().toISOString(), totalJobs: 0, completedDetails: 0, status: 'idle' });
          saveProjectIndex(idx);
          res.end(JSON.stringify({ ok: true, id }));
        } catch (e) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: e.message })); }
      });
      return;
    }

    // POST /projects/{id}/start  — 开始爬取指定项目
    const startMatch = pathname && pathname.match(/^\/projects\/([^/]+)\/start$/);
    if (startMatch && req.method === 'POST') {
      currentProjectId = decodeURIComponent(startMatch[1]);
      const idx = loadProjectIndex();
      const proj = idx.find(p => p.id === currentProjectId);
      if (!proj) { res.writeHead(404); res.end(JSON.stringify({ ok: false, error: '项目不存在' })); return; }
      // 从项目加载配置
      const cfgFile = path.join(PROJECTS_DIR, currentProjectId, 'config.json');
      if (fs.existsSync(cfgFile)) {
        Object.assign(CONFIG.apiParams, JSON.parse(fs.readFileSync(cfgFile, 'utf-8')));
      }
      proj.status = 'running';
      saveProjectIndex(idx);
      stopRequested = false;
      crawlRequested = true;
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // POST /projects/{id}/delete — 删除项目（用 POST 避免 CORS 预检问题）
    const delMatch = pathname && pathname.match(/^\/projects\/([^/]+)\/delete$/);
    console.log(`[路由] ${req.method} ${pathname} — delMatch:`, delMatch ? `id=${delMatch[1]}` : 'null');
    if (delMatch && req.method === 'POST') {
      const id = decodeURIComponent(delMatch[1]);
      console.log(`[删除] 开始处理: id="${id}"`);
      const dir = path.join(PROJECTS_DIR, id);
      console.log(`[删除] 目录路径: ${dir}, 存在=${fs.existsSync(dir)}`);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`[删除] 目录已删除`);
      }
      const before = loadProjectIndex();
      console.log(`[删除] 删除前索引条目数: ${before.length}`);
      for (const p of before) console.log(`  - id="${p.id}"`);
      const after = before.filter(p => p.id !== id);
      saveProjectIndex(after);
      console.log(`[删除] 删除后索引条目数: ${after.length}`);
      res.end(JSON.stringify({ ok: true }));
      console.log(`[删除] 响应已发送`);
      return;
    }

    if (pathname === '/pool/stats') {
      res.end(JSON.stringify({ totalJobs: Object.keys(jobPool).length }));
      return;
    }

    // GET /projects/{id}/output — 返回项目的 output.json
    const outputMatch = pathname && pathname.match(/^\/projects\/([^/]+)\/output$/);
    if (outputMatch) {
      const outputPath = path.join(PROJECTS_DIR, decodeURIComponent(outputMatch[1]), 'output.json');
      if (fs.existsSync(outputPath)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(fs.readFileSync(outputPath, 'utf-8'));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ ok: false, error: 'output.json 不存在或项目尚未完成' }));
      }
      return;
    }

    res.writeHead(404);
    console.log(`[404] 未匹配: ${req.method} ${pathname}`);
    res.end('not found');
  });
  server.listen(CONFIG.tokenServerPort);
  return server;
}

async function waitForTokens() {
  if (fs.existsSync(CONFIG.configFile)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG.configFile, 'utf-8'));
      if (cfg.cookie && cfg.zp_token) {
        lastTokens = { cookie: cfg.cookie, zp_token: cfg.zp_token, token: cfg.token || '' };
        tokenReady = true;
        return; // 已有 tokens，直接开始
      }
    } catch (_) {}
  }

  process.stdout.write('[认证] 等待扩展发送 tokens');
  while (!tokenReady) {
    await sleep(2000);
    process.stdout.write('.');
  }
  console.log(' ✓\n');
}

async function waitForStartSignal() {
  if (crawlRequested) return;
  console.log('[等待] 请在浏览器扩展中点击"开始爬取"▶\n');
  while (!crawlRequested) {
    await sleep(2000);
  }
  console.log('[开始] 收到指令，开始爬取\n');
}

// ============================================================
// 搜索 API
// ============================================================
async function searchJobs(pageNum) {
  const params = new URLSearchParams({
    page: String(pageNum),
    pageSize: String(CONFIG.apiParams.pageSize),
    city: CONFIG.apiParams.city,
    jobType: CONFIG.apiParams.jobType,
    query: CONFIG.apiParams.query,
    expectInfo: '', multiSubway: '', multiBusinessDistrict: '',
    position: '', salary: '', experience: '', degree: '', industry: '',
    scale: '', stage: '', scene: String(CONFIG.apiParams.scene),
    encryptExpectId: '',
  });

  const data = await fetchAPI(
    'https://www.zhipin.com/wapi/zpgeek/search/joblist.json?_=' + Date.now(),
    { method: 'POST', body: params }
  );

  if (data.code !== 0 && data.code !== 1) {
    throw new Error(`搜索API: code=${data.code} ${data.message}`);
  }

  return {
    jobs: data.zpData?.jobList || [],
    hasMore: data.zpData?.hasMore !== false,
  };
}

// ============================================================
// 详情 API（含重试）
// ============================================================
async function getJobDetail(securityId, lid) {
  const data = await fetchAPI(
    `https://www.zhipin.com/wapi/zpgeek/job/detail.json?securityId=${encodeURIComponent(securityId)}&lid=${lid}&_=${Date.now()}`
  );
  if (data.code !== 0 && data.code !== 1) return null;
  const d = data.zpData;
  return typeof d.jobInfo === 'string' ? JSON.parse(d.jobInfo) : d.jobInfo;
}

async function getJobDetailWithRetry(securityId, lid, label) {
  for (let attempt = 1; attempt <= CONFIG.retryMax; attempt++) {
    try {
      const detail = await getJobDetail(securityId, lid);
      if (detail && detail.postDescription) {
        if (attempt > 1) console.log(`    (第${attempt}次尝试成功)`);
        return detail;
      }
      if (detail && !detail.postDescription) {
        // 请求成功但描述为空——可能内容如此，视为成功
        return detail;
      }
    } catch (e) {
      // 网络错误等
    }
    if (attempt < CONFIG.retryMax) {
      // 递增延迟 + 随机抖动 (±25%)，避免与 WAF 速率窗口同步
      const wait = Math.round(CONFIG.retryDelay * attempt * (0.75 + Math.random() * 0.5));
      console.log(`    (第${attempt}次失败, ${wait / 1000}s 后重试...)`);
      await sleep(wait);
    }
  }
  console.log(`    (重试${CONFIG.retryMax}次均失败，跳过)`);
  return null;
}

// ============================================================
// 岗位数据合并
// ============================================================
function parseJob(listItem, detailInfo) {
  return {
    id: listItem.encryptJobId || '',
    title: listItem.jobName || '',
    salary: listItem.salaryDesc || '',
    city: listItem.cityName || '',
    district: listItem.areaDistrict || '',
    businessDistrict: listItem.businessDistrict || '',
    experience: listItem.jobExperience || '',
    education: listItem.jobDegree || '',
    daysPerWeek: listItem.daysPerWeekDesc || '',
    leastMonth: listItem.leastMonthDesc || '',
    skills: listItem.jobLabels || [],
    skills2: listItem.skills || [],
    welfareList: listItem.welfareList || [],

    company: {
      name: listItem.brandName || '',
      industry: listItem.brandIndustry || '',
      scale: listItem.brandScaleName || '',
      stage: listItem.brandStageName || '',
      logo: listItem.brandLogo || '',
      encryptBrandId: listItem.encryptBrandId || '',
    },

    recruiter: {
      name: listItem.bossName || '',
      title: listItem.bossTitle || '',
      avatar: listItem.bossAvatar || '',
      online: listItem.bossOnline || false,
    },

    detailUrl: listItem.encryptJobId
      ? `https://www.zhipin.com/job_detail/${encodeURIComponent(listItem.encryptJobId)}.html`
      : '',

    // 从详情 API 补充的字段
    description: detailInfo?.postDescription || '',
    descriptionShort: detailInfo?.postDescription
      ? detailInfo.postDescription.substring(0, 200)
      : '',
    address: detailInfo?.address || '',
    location: listItem.gps || null,
    showSkills: detailInfo?.showSkills || [],
    recruitmentCount: detailInfo?.recruitmentCountDesc || '',
    updateTime: detailInfo?.jobStatusDesc || '',
    invalidStatus: detailInfo?.invalidStatus ?? false,

    // 内部字段（用于断点续爬）
    _securityId: listItem.securityId || '',
    _lid: listItem.lid || '',
  };
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  console.log('========================================');
  console.log('  Boss直聘 岗位信息爬虫 v7');
  console.log(`  关键词: ${CONFIG.apiParams.query}`);
  console.log(`  城市:   广州 | 最大页: ${CONFIG.maxPages}`);
  console.log('========================================\n');

  // 初始化项目目录和全局岗位池
  initProjectDir();
  loadPool();

  // 清理遗留的 running 状态（上次爬虫异常退出）
  const idx = loadProjectIndex();
  let dirty = false;
  for (const p of idx) { if (p.status === 'running') { p.status = 'idle'; dirty = true; } }
  if (dirty) { saveProjectIndex(idx); console.log('[项目] 已清理遗留的 running 状态\n'); }

  // 启动内嵌 token 接收服务器（端口 8892）
  startTokenServer();
  console.log(`[服务器] Token 接收端口: ${CONFIG.tokenServerPort}\n`);

  // 等待 tokens 就绪
  await waitForTokens();

  // 循环：等待开始指令 → 爬取 → 可能暂停再等待
  while (true) {
    crawlRequested = false;
    await waitForStartSignal();
    await runCrawl();

    if (!stopRequested) {
      // 正常完成，退出循环
      console.log('\n--- Token 服务器仍在运行，按 Ctrl+C 停止 ---');
      break;
    }

    // 用户暂停，回到等待状态
    console.log('\n[暂停] 爬取已暂停，可重新配置参数后再次点击"开始爬取"\n');
  }
}

function getProjectPath(...segments) {
  if (!currentProjectId) return null;
  return path.join(PROJECTS_DIR, currentProjectId, ...segments);
}

async function runCrawl() {
  const projDir = getProjectPath();
  const projProgressFile = projDir ? path.join(projDir, 'progress.json') : CONFIG.progressFile;
  const projOutputFile  = projDir ? path.join(projDir, 'output.json')  : CONFIG.outputFile;

  // 读取已有进度
  let progress = { completedIds: [], allJobs: [] };
  if (fs.existsSync(projProgressFile)) {
    try {
      progress = JSON.parse(fs.readFileSync(projProgressFile, 'utf-8'));
    } catch {}
  }
  // ── 第1阶段: 搜索（已有进度时跳过） ──
  if (progress.allJobs.length === 0) {
    let newJobs = [];
    for (let page = 1; page <= CONFIG.maxPages; page++) {
      if (stopRequested) break;
      console.log(`[搜索] 第${page}页...`);
      try {
        const result = await searchJobs(page);
        if (result.jobs.length === 0) { console.log('  无更多数据'); break; }
        newJobs = newJobs.concat(result.jobs);
        console.log(`  +${result.jobs.length} 个（累计 ${newJobs.length}）`);
        if (!result.hasMore) { console.log('  已到最后一页'); break; }
        await sleep(CONFIG.delayBetweenPages);
      } catch (e) { console.log(`  [错误] ${e.message}`); break; }
    }
    progress.allJobs = newJobs;
  } else {
    console.log(`[进度] 续爬 ${progress.allJobs.length} 个岗位, 已完成 ${progress.completedIds.length} 个详情\n`);
  }

  // 统计 pool 命中情况
  let poolHits = 0;
  const pending = progress.allJobs.filter(j => j.encryptJobId && !progress.completedIds.includes(j.encryptJobId));
  for (const j of pending) {
    if (jobPool[j.encryptJobId]) {
      j._detail = jobPool[j.encryptJobId].detail;
      progress.completedIds.push(j.encryptJobId);
      poolHits++;
    }
  }
  if (poolHits > 0) console.log(`[池] 命中 ${poolHits} 个岗位，跳过 API 请求`);
  savePoolProgress(progress, projProgressFile);

  // ── 第2阶段: 获取剩余详情 ──
  const stillPending = progress.allJobs.filter(j => j.encryptJobId && !progress.completedIds.includes(j.encryptJobId));
  console.log(`[详情] 待获取 ${stillPending.length} 个岗位\n`);

  let poolDirty = false;
  for (let i = 0; i < stillPending.length; i++) {
    if (stopRequested) break;
    const item = stillPending[i];
    const sid = item.securityId;
    const lid = item.lid;
    if (!sid || !lid) {
      console.log(`  [${i + 1}/${stillPending.length}] ${item.jobName} — 跳过（无securityId）`);
      progress.completedIds.push(item.encryptJobId);
      savePoolProgress(progress, projProgressFile);
      continue;
    }
    const label = `${item.jobName} @ ${item.brandName || ''}`;
    process.stdout.write(`  [${i + 1}/${stillPending.length}] ${label} ...`);
    const detail = await getJobDetailWithRetry(sid, lid, label);

    if (detail) {
      item._detail = detail;
      jobPool[item.encryptJobId] = { detail, scrapedAt: new Date().toISOString() };
      poolDirty = true;
      const descLen = (detail.postDescription || '').length;
      console.log(` ✓ (${descLen}字)`);
    } else {
      console.log(` ✗ 无描述`);
    }

    progress.completedIds.push(item.encryptJobId);
    savePoolProgress(progress, projProgressFile);

    // 每 20 个新岗位写一次 pool
    if (poolDirty && progress.completedIds.length % 20 === 0) { savePool(); poolDirty = false; }

    if (i < stillPending.length - 1) await sleep(CONFIG.delayBetweenDetails);
  }

  if (poolDirty) savePool();

  // ── 第3阶段: 输出 ──
  if (!stopRequested) {
    const outputData = {
      config: {
        query: CONFIG.apiParams.query, city: CONFIG.apiParams.city,
        jobType: CONFIG.apiParams.jobType,
        scrapeTime: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
      },
      total: progress.allJobs.length,
      completedDetails: progress.completedIds.length,
      jobs: progress.allJobs.map(j => parseJob(j, j._detail)),
    };
    fs.writeFileSync(projOutputFile, JSON.stringify(outputData, null, 2), 'utf-8');
    console.log(`\n完成！${outputData.total} 个岗位 → ${projOutputFile}`);
    console.log(`其中 ${outputData.completedDetails} 个有完整描述`);
    if (fs.existsSync(projProgressFile)) fs.unlinkSync(projProgressFile);

    // 更新项目索引 — 完成
    if (currentProjectId) {
      const idx = loadProjectIndex();
      const p = idx.find(x => x.id === currentProjectId);
      if (p) { p.status = 'completed'; p.totalJobs = outputData.total; p.completedDetails = outputData.completedDetails; saveProjectIndex(idx); }
    }
  } else {
    // 更新项目索引 — 暂停
    if (currentProjectId) {
      const idx = loadProjectIndex();
      const p = idx.find(x => x.id === currentProjectId);
      if (p) { p.status = 'idle'; p.totalJobs = progress.allJobs.length; p.completedDetails = progress.completedIds.length; saveProjectIndex(idx); }
    }
  }
}

function savePoolProgress(progress, projProgressFile) {
  fs.writeFileSync(projProgressFile, JSON.stringify(progress), 'utf-8');
}

main().catch((e) => {
  console.error(`\n[错误] ${e.message}`);
});
