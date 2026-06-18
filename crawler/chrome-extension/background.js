// 后台脚本：监听 BOSS直聘 API 请求，捕获 tokens
// 同时定时刷新页面保活（替代 Tampermonkey）
const TARGET_PATHS = [
  '/wapi/zpgeek/search/joblist.json',
  '/wapi/zpgeek/job/detail.json',
];
const SERVER_URL = 'http://127.0.0.1:8892/update-token';

let lastTokens = { cookie: '', zp_token: '', token: '' };

// ============================================================
// Token 捕获（与之前一致）
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
// 页面保活刷新（替代 Tampermonkey）
// 每 10 秒刷新一次 zhipin 页面，保持 token 新鲜
// 使用整页刷新而非静默 API 请求，绕过 WAF 检测
// ============================================================
const REFRESH_INTERVAL_MS = 10000;
let refreshTabId = null;

async function refreshZhipin() {
  try {
    if (refreshTabId) {
      await chrome.tabs.reload(refreshTabId);
      return;
    }
  } catch (_) {
    // 标签页已关闭，重新创建
    refreshTabId = null;
  }

  try {
    const tab = await chrome.tabs.create({
      url: 'https://www.zhipin.com/web/geek/jobs',
      active: false,
    });
    refreshTabId = tab.id;
  } catch (_) {
    // 静默失败
  }
}

// 启动定时刷新
chrome.alarms.create('refresh-zhipin', {
  periodInMinutes: REFRESH_INTERVAL_MS / 60000,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh-zhipin') {
    refreshZhipin();
  }
});

console.log('[TokenCapturer] 已启动（捕获 + 每10s页面保活）');
