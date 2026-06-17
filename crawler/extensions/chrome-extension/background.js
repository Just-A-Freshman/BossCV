// 后台脚本：监听 BOSS直聘 API 请求，捕获 tokens
const TARGET_PATHS = [
  '/wapi/zpgeek/search/joblist.json',
  '/wapi/zpgeek/job/detail.json',
];
const SERVER_URL = 'http://127.0.0.1:8892/update-token';

let lastTokens = { cookie: '', zp_token: '', token: '' };

function captureHeaders(details) {
  // 只判断 URL 中是否包含目标路径
  const url = details.url;
  const isTarget = TARGET_PATHS.some(p => url.includes(p));
  if (!isTarget) return;

  // 提取 headers
  let cookie = '', zp_token = '', token = '';
  for (const h of details.requestHeaders || []) {
    const name = h.name.toLowerCase();
    if (name === 'cookie') cookie = h.value;
    else if (name === 'zp_token') zp_token = h.value;
    else if (name === 'token') token = h.value;
  }

  if (!cookie || !zp_token) {
    console.log('[TokenCapturer] headers 不完整，跳过');
    return;
  }

  // 去重
  if (cookie === lastTokens.cookie && zp_token === lastTokens.zp_token && token === lastTokens.token) {
    return;
  }
  lastTokens = { cookie, zp_token, token };

  // 保存到本地存储
  chrome.storage.local.set({ lastTokens });

  // 发送到本地服务器
  fetch(SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie, zp_token, token }),
  }).then(r => {
    if (r.ok) console.log('[TokenCapturer] tokens 已发送');
  }).catch(e => {
    console.log('[TokenCapturer] 服务器未启动，tokens 保存在扩展中');
  });
}

// 注册 webRequest 监听器
chrome.webRequest.onBeforeSendHeaders.addListener(
  captureHeaders,
  { urls: ['https://www.zhipin.com/*'] },
  ['requestHeaders', 'extraHeaders']
);

console.log('[TokenCapturer] 后台服务已启动');
