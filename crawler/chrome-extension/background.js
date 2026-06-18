// 后台脚本：监听 BOSS直聘 API 请求，捕获 tokens
// 同时定时刷新页面保活（替代 Tampermonkey）
const TARGET_PATHS = [
  '/wapi/zpgeek/search/joblist.json',
  '/wapi/zpgeek/job/detail.json',
];
const SERVER_URL = 'http://127.0.0.1:8892/update-token';
const SETTINGS_URL = 'http://127.0.0.1:8892/update-settings';
const CRAWL_URL = 'http://127.0.0.1:8892/start-crawl';
const STOP_CRAWL_URL = 'http://127.0.0.1:8892/stop-crawl';
const PROJECT_API = 'http://127.0.0.1:8892/projects';

let lastTokens = { cookie: '', zp_token: '', token: '' };

// 清除上次会话残留的刷新定时器，避免浏览器重启后自动打开BOSS页面
chrome.alarms.clear('refresh-zhipin');

// ============================================================
// Token 捕获
// ============================================================
function captureHeaders(details) {
  const url = details.url;
  const isTarget = TARGET_PATHS.some(p => url.includes(p));
  if (!isTarget) return;

  let cookie = '', zp_token = '', token = '';
  for (const h of details.requestHeaders || []) {
    const name = h.name.toLowerCase();
    if (name === 'cookie') cookie = h.value;
    else if (name === 'zp_token') zp_token = h.value;
    else if (name === 'token') token = h.value;
  }

  if (!cookie || !zp_token) return;

  if (cookie === lastTokens.cookie && zp_token === lastTokens.zp_token && token === lastTokens.token) {
    return;
  }
  lastTokens = { cookie, zp_token, token };

  chrome.storage.local.set({ lastTokens });

  fetch(SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie, zp_token, token }),
  }).catch(() => {});
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  captureHeaders,
  { urls: ['https://www.zhipin.com/*'] },
  ['requestHeaders', 'extraHeaders']
);

// ============================================================
// 捕获搜索请求参数（用于保存筛选条件）
// ============================================================
let lastSearchParams = null;

chrome.storage.local.get('lastSearchParams', (data) => {
  if (data.lastSearchParams) lastSearchParams = data.lastSearchParams;
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!details.url.includes('/wapi/zpgeek/search/joblist.json')) return;

    let params = null;
    if (details.requestBody && details.requestBody.formData) {
      params = {};
      for (const [key, vals] of Object.entries(details.requestBody.formData)) {
        params[key] = vals[0];
      }
    }
    if (!params && details.requestBody && details.requestBody.raw) {
      const enc = new TextDecoder('utf-8');
      let raw = '';
      for (const chunk of details.requestBody.raw) {
        raw += enc.decode(chunk.bytes);
      }
      if (raw) {
        params = Object.fromEntries(new URLSearchParams(raw));
      }
    }
    if (!params) {
      const qIdx = details.url.indexOf('?');
      if (qIdx !== -1) {
        params = Object.fromEntries(new URLSearchParams(details.url.slice(qIdx)));
      }
    }

    if (params) {
      lastSearchParams = params;
      chrome.storage.local.set({ lastSearchParams });
    }
  },
  { urls: ['https://www.zhipin.com/*'] },
  ['requestBody']
);

// ============================================================
// 消息路由（接收 content.js 指令）
// ============================================================
const REFRESH_INTERVAL_MS = 10000;
let refreshTabId = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.command) {
    case 'saveSearchParams':
      saveSearchParams(msg.urlParams).then((r) => sendResponse(r));
      return true;

    case 'startCrawl':
      startCrawl().then((r) => sendResponse(r));
      return true;

    case 'stopCrawl':
      stopCrawl().then((r) => sendResponse(r));
      return true;

    case 'startProject':
      startProject(msg.projectId).then((r) => sendResponse(r));
      return true;

    case 'getSearchParams':
      sendResponse({ params: lastSearchParams || null });
      break;

    default:
      sendResponse({ ok: false, error: 'unknown command' });
  }
});

// ============================================================
// 保存搜索条件
// ============================================================
async function saveSearchParams(urlParams) {
  const params = lastSearchParams || urlParams;
  if (!params || Object.keys(params).length === 0) {
    return { ok: false, error: '请先在BOSS页面执行一次搜索，再点击保存' };
  }

  try {
    const resp = await fetch(SETTINGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiParams: params }),
    });
    return await resp.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================
// 开始爬取 → 启动页面刷新 + 通知爬虫
// ============================================================
async function startCrawl() {
  try {
    // 先启动页面保活刷新（确保 token 新鲜）
    startRefresh();
    // 再通知爬虫开始
    const resp = await fetch(CRAWL_URL);
    const data = await resp.json();
    return data;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================
// 开始项目爬取 → 启动页面刷新 + 通知爬虫
// ============================================================
async function startProject(projectId) {
  try {
    startRefresh();
    const resp = await fetch(PROJECT_API + '/' + projectId + '/start', { method: 'POST' });
    const data = await resp.json();
    return data;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============================================================
// 暂停爬取 → 停止页面刷新 + 通知爬虫停止
// ============================================================
async function stopCrawl() {
  // 无论如何先停掉页面刷新
  stopRefresh();
  // 通知爬虫停止（连不上也返回成功，至少刷新停了）
  try {
    await fetch(STOP_CRAWL_URL);
  } catch (_) {}
  return { ok: true };
}

// ============================================================
// 页面保活刷新
// ============================================================
function startRefresh() {
  chrome.alarms.create('refresh-zhipin', {
    periodInMinutes: REFRESH_INTERVAL_MS / 60000,
  });
}

function stopRefresh() {
  chrome.alarms.clear('refresh-zhipin');
  refreshTabId = null;
}

async function refreshZhipin() {
  try {
    if (refreshTabId) {
      await chrome.tabs.reload(refreshTabId);
      return;
    }
  } catch (_) {
    refreshTabId = null;
  }

  try {
    const tab = await chrome.tabs.create({
      url: 'https://www.zhipin.com/web/geek/jobs',
      active: false,
    });
    refreshTabId = tab.id;
  } catch (_) {}
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh-zhipin') {
    refreshZhipin();
  }
});

console.log('[TokenCapturer] 已启动（等待开始指令）');
