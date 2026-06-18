chrome.storage.local.get('lastTokens', (data) => {
  const tokens = data.lastTokens || {};
  const display = document.getElementById('tokenDisplay');
  const status = document.getElementById('status');

  if (tokens.cookie) {
    status.textContent = '✓ 已捕获 tokens';
    status.style.color = 'green';
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
