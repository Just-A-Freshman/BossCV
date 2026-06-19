// ---- 刷新间隔控制 ----
const range = document.getElementById('intervalRange');
const label = document.getElementById('intervalLabel');

function loadInterval() {
  chrome.storage.local.get('refreshInterval', (data) => {
    const val = data.refreshInterval || 10;
    range.value = val;
    label.textContent = val + 's';
  });
}

range.addEventListener('input', () => {
  const val = parseInt(range.value);
  label.textContent = val + 's';
});

range.addEventListener('change', () => {
  const val = parseInt(range.value);
  chrome.storage.local.set({ refreshInterval: val });
  chrome.runtime.sendMessage({ command: 'setRefreshInterval', interval: val });
});

loadInterval();

// ---- Token 显示 ----
chrome.storage.local.get('lastTokens', (data) => {
  const tokens = data.lastTokens || {};
  const display = document.getElementById('tokenDisplay');
  const status = document.getElementById('status');

  if (tokens.cookie) {
    status.textContent = '已捕获 tokens';
    status.style.color = '#52c41a';
    display.innerHTML = `
      <p><b>cookie:</b><br>${tokens.cookie.substring(0, 80)}...</p>
      <p><b>zp_token:</b><br>${tokens.zp_token}</p>
      <p><b>token:</b><br>${tokens.token}</p>
    `;
  } else {
    status.textContent = '等待 BOSS直聘 API 请求...';
    display.innerHTML = '<p>刷新 BOSS直聘页面后自动捕获</p>';
  }
});
