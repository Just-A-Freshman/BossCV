// 右下角悬浮面板 — 两页设计
(function () {
  const MODE = { IDLE: 1, CRAWLING: 2 };
  let currentMode = MODE.IDLE;

  // ---- 创建 UI ----
  const panel = document.createElement('div');
  panel.id = 'boss-scraper-panel';
  panel.innerHTML = `
    <style>
      #boss-scraper-panel {
        all: initial;
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        font: 13px/1.5 -apple-system, "Microsoft YaHei", sans-serif;
        color: #333;
      }
      #boss-scraper-panel .ps-wrap {
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 2px 12px rgba(0,0,0,.15);
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 160px;
      }
      #boss-scraper-panel .ps-title {
        font-size: 12px;
        color: #999;
        margin-bottom: 2px;
      }
      #boss-scraper-panel .ps-btn {
        border: none;
        border-radius: 4px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
        transition: background .15s;
      }
      #boss-scraper-panel .ps-btn-primary {
        background: #1677ff;
        color: #fff;
      }
      #boss-scraper-panel .ps-btn-primary:hover { background: #4096ff; }
      #boss-scraper-panel .ps-btn-danger {
        background: #ff4d4f;
        color: #fff;
      }
      #boss-scraper-panel .ps-btn-danger:hover { background: #ff7875; }
      #boss-scraper-panel .ps-btn-default {
        background: #f5f5f5;
        color: #333;
      }
      #boss-scraper-panel .ps-btn-default:hover { background: #e8e8e8; }
      #boss-scraper-panel .ps-btn:disabled {
        opacity: .5;
        cursor: not-allowed;
      }
      #boss-scraper-panel .ps-status {
        font-size: 11px;
      }
      #boss-scraper-panel .ps-status.idle { color: #999; }
      #boss-scraper-panel .ps-status.crawling { color: #52c41a; }
    </style>
    <div class="ps-wrap">
      <div class="ps-title">🐞 爬虫控制</div>
      <!-- 页面1: 待机 -->
      <div id="ps-page1">
        <div class="ps-status idle" id="ps-status1">⏸ 待机中</div>
        <button class="ps-btn ps-btn-default" id="ps-btn-save">💾 保存当前搜索</button>
        <button class="ps-btn ps-btn-primary" id="ps-btn-crawl">▶ 开始爬取</button>
      </div>
      <!-- 页面2: 爬取中 -->
      <div id="ps-page2" style="display:none">
        <div class="ps-status crawling" id="ps-status2">● 爬取中</div>
        <button class="ps-btn ps-btn-danger" id="ps-btn-stop">⏸ 暂停爬取</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const page1 = panel.querySelector('#ps-page1');
  const page2 = panel.querySelector('#ps-page2');
  const saveBtn = panel.querySelector('#ps-btn-save');
  const crawlBtn = panel.querySelector('#ps-btn-crawl');
  const stopBtn = panel.querySelector('#ps-btn-stop');

  function showPage(mode) {
    currentMode = mode;
    page1.style.display = mode === MODE.IDLE ? '' : 'none';
    page2.style.display = mode === MODE.CRAWLING ? '' : 'none';
  }

  // ---- 保存搜索条件 ----
  saveBtn.addEventListener('click', () => {
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ 保存中...';
    const urlParams = Object.fromEntries(new URLSearchParams(window.location.search));

    chrome.runtime.sendMessage({
      command: 'saveSearchParams',
      urlParams,
      url: window.location.href,
    }, (resp) => {
      if (resp && resp.ok) {
        saveBtn.textContent = '✅ 已保存';
        setTimeout(() => { saveBtn.textContent = '💾 保存当前搜索'; saveBtn.disabled = false; }, 2000);
      } else {
        const reason = resp && resp.error ? resp.error : '连接后台失败';
        saveBtn.textContent = '❌ ' + reason;
        setTimeout(() => { saveBtn.textContent = '💾 保存当前搜索'; saveBtn.disabled = false; }, 3000);
      }
    });
  });

  // ---- 开始爬取 ----
  crawlBtn.addEventListener('click', () => {
    crawlBtn.disabled = true;
    crawlBtn.textContent = '⏳ 请求中...';
    chrome.runtime.sendMessage({ command: 'startCrawl' }, (resp) => {
      if (resp && resp.ok) {
        showPage(MODE.CRAWLING);
      } else {
        const reason = resp && resp.error ? resp.error : '连接后台失败';
        crawlBtn.textContent = '❌ ' + reason;
        setTimeout(() => { crawlBtn.textContent = '▶ 开始爬取'; crawlBtn.disabled = false; }, 3000);
      }
    });
  });

  // ---- 暂停爬取 ----
  stopBtn.addEventListener('click', () => {
    stopBtn.disabled = true;
    stopBtn.textContent = '⏳ 暂停中...';
    chrome.runtime.sendMessage({ command: 'stopCrawl' }, (resp) => {
      if (resp && resp.ok) {
        showPage(MODE.IDLE);
      } else {
        const reason = resp && resp.error ? resp.error : '连接后台失败';
        stopBtn.textContent = '❌ ' + reason;
        setTimeout(() => { stopBtn.textContent = '⏸ 暂停爬取'; stopBtn.disabled = false; }, 3000);
      }
    });
  });
})();
