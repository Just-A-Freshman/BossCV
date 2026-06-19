// 右下角悬浮面板 — 项目选择 + 控制
(function () {
  const API = 'http://127.0.0.1:8892';
  let projects = [];
  let capturedParams = null;  // 从 background 获取的搜索参数

  // ---- 创建 UI ----
  const panel = document.createElement('div');
  panel.id = 'boss-scraper-panel';
  panel.innerHTML = `
    <style>
      #boss-scraper-panel {
        all: initial; position: fixed; bottom: 24px; right: 24px; z-index: 999999;
        font: 14px/1.6 -apple-system, "Microsoft YaHei", sans-serif; color: #333;
      }
      #boss-scraper-panel .ps-wrap {
        background: #fff; border: 1px solid #d9d9d9; border-radius: 10px;
        box-shadow: 0 4px 16px rgba(0,0,0,.12); padding: 14px 18px;
        display: flex; flex-direction: column; gap: 8px; min-width: 280px;
      }
      #boss-scraper-panel .ps-title {
        font-size: 13px; font-weight: 600; color: #666;
        display: flex; justify-content: space-between; align-items: center;
      }
      #boss-scraper-panel .ps-title .ps-refresh { cursor: pointer; color: #999; font-size: 12px; }
      #boss-scraper-panel .ps-title .ps-refresh:hover { color: #1677ff; }
      #boss-scraper-panel select, #boss-scraper-panel input {
        width: 100%; padding: 6px 8px; border: 1px solid #d9d9d9; border-radius: 6px;
        font-size: 13px; box-sizing: border-box; outline: none;
      }
      #boss-scraper-panel select:focus, #boss-scraper-panel input:focus { border-color: #1677ff; }
      #boss-scraper-panel .ps-row { display: flex; gap: 6px; align-items: center; }
      #boss-scraper-panel .ps-row .ps-grow { flex: 1; }
      #boss-scraper-panel .ps-btn {
        border: none; border-radius: 6px; padding: 7px 14px; cursor: pointer;
        font-size: 13px; transition: background .15s; white-space: nowrap; font-weight: 500;
      }
      #boss-scraper-panel .ps-btn:disabled { opacity: .5; cursor: not-allowed; }
      #boss-scraper-panel .ps-btn-primary { background: #1677ff; color: #fff; }
      #boss-scraper-panel .ps-btn-primary:hover { background: #4096ff; }
      #boss-scraper-panel .ps-btn-danger { background: #ff4d4f; color: #fff; }
      #boss-scraper-panel .ps-btn-danger:hover { background: #ff7875; }
      #boss-scraper-panel .ps-btn-default { background: #f5f5f5; color: #333; }
      #boss-scraper-panel .ps-btn-default:hover { background: #e8e8e8; }
      #boss-scraper-panel .ps-btn-success { background: #52c41a; color: #fff; }
      #boss-scraper-panel .ps-btn-success:hover { background: #73d13d; }
      #boss-scraper-panel .ps-status { font-size: 12px; padding: 2px 0; }
      #boss-scraper-panel .ps-status.idle { color: #999; }
      #boss-scraper-panel .ps-status.crawling { color: #52c41a; font-weight: 600; }
      #boss-scraper-panel .ps-status.done { color: #1677ff; }
      #boss-scraper-panel .ps-new-project { display: none; flex-direction: column; gap: 6px; }
      #boss-scraper-panel .ps-params { font-size: 12px; color: #666; background: #f5f5f5; border-radius: 4px; padding: 6px 8px; line-height: 1.5; }
      #boss-scraper-panel .ps-progress { display: none; flex-direction: column; gap: 4px; }
      #boss-scraper-panel .ps-progress-bar { height: 6px; background: #f0f0f0; border-radius: 3px; overflow: hidden; }
      #boss-scraper-panel .ps-progress-fill { height: 100%; background: #52c41a; border-radius: 3px; transition: width .3s ease; width: 0%; }
      #boss-scraper-panel .ps-progress-text { font-size: 12px; color: #666; line-height: 1.4; }
      #boss-scraper-panel .ps-progress-detail { font-size: 11px; color: #999; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    </style>
    <div class="ps-wrap">
      <div class="ps-title">
        <span>爬虫控制</span>
        <span class="ps-refresh" id="ps-refresh">刷新</span>
      </div>
      <!-- 项目选择行 -->
      <div class="ps-row" id="ps-project-row">
        <select id="ps-project-select" class="ps-grow"><option value="">-- 选择项目 --</option></select>
        <button class="ps-btn ps-btn-default" id="ps-btn-del" title="删除选中项目">-</button>
        <button class="ps-btn ps-btn-default" id="ps-btn-new">+</button>
      </div>
      <!-- 新建项目表单 -->
      <div class="ps-new-project" id="ps-new-project">
        <input type="text" id="ps-name-input" placeholder="输入项目名称..." />
        <div class="ps-params" id="ps-params-display">尚未捕获搜索条件，请先在 BOSS 页面执行一次搜索</div>
        <div class="ps-row">
          <button class="ps-btn ps-btn-default" id="ps-btn-capture">重新捕获</button>
          <button class="ps-btn ps-btn-primary ps-grow" id="ps-btn-create">创建</button>
          <button class="ps-btn ps-btn-default" id="ps-btn-cancel-new">取消</button>
        </div>
      </div>
      <!-- 状态 & 进度 -->
      <div class="ps-status idle" id="ps-status">待机中</div>
      <div class="ps-progress" id="ps-progress">
        <div class="ps-progress-bar"><div class="ps-progress-fill" id="ps-progress-fill"></div></div>
        <div class="ps-progress-text" id="ps-progress-text"></div>
        <div class="ps-progress-detail" id="ps-progress-detail"></div>
      </div>
      <div class="ps-row" id="ps-actions-idle" style="display:none">
        <button class="ps-btn ps-btn-primary ps-grow" id="ps-btn-start">开始爬取</button>
      </div>
      <div class="ps-row" id="ps-actions-crawling" style="display:none">
        <button class="ps-btn ps-btn-danger ps-grow" id="ps-btn-stop">暂停爬取</button>
      </div>
      <div class="ps-row" id="ps-actions-done" style="display:none">
        <button class="ps-btn ps-btn-success ps-grow" id="ps-btn-view">查看结果</button>
        <button class="ps-btn ps-btn-default" id="ps-btn-rerun">重新爬取</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const sel = panel.querySelector('#ps-project-select');
  const statusEl = panel.querySelector('#ps-status');
  const projectRow = panel.querySelector('#ps-project-row');
  const idleActions = panel.querySelector('#ps-actions-idle');
  const crawlingActions = panel.querySelector('#ps-actions-crawling');
  const doneActions = panel.querySelector('#ps-actions-done');
  const newProjectForm = panel.querySelector('#ps-new-project');
  const paramsDisplay = panel.querySelector('#ps-params-display');
  const progressEl = panel.querySelector('#ps-progress');
  const progressFill = panel.querySelector('#ps-progress-fill');
  const progressText = panel.querySelector('#ps-progress-text');
  const progressDetail = panel.querySelector('#ps-progress-detail');
  const startBtn = panel.querySelector('#ps-btn-start');
  const stopBtn = panel.querySelector('#ps-btn-stop');
  const delBtn = panel.querySelector('#ps-btn-del');
  const newBtn = panel.querySelector('#ps-btn-new');
  const createBtn = panel.querySelector('#ps-btn-create');
  const cancelNewBtn = panel.querySelector('#ps-btn-cancel-new');
  const captureBtn = panel.querySelector('#ps-btn-capture');
  const viewBtn = panel.querySelector('#ps-btn-view');
  const rerunBtn = panel.querySelector('#ps-btn-rerun');
  const nameInput = panel.querySelector('#ps-name-input');
  const refreshBtn = panel.querySelector('#ps-refresh');

  // ---- 加载项目列表 ----
  async function loadProjects() {
    try {
      const resp = await fetch(API + '/projects?_=' + Date.now());
      projects = await resp.json();
      const val = sel.value;
      sel.innerHTML = '<option value="">-- 选择项目 --</option>';
      const runningProj = projects.find(p => p.status === 'running');
      for (const p of projects) {
        const opt = document.createElement('option');
        opt.value = p.id;
        const icon = p.status === 'running' ? '> ' : p.status === 'completed' ? 'v ' : '  ';
        const label = p.name || p.id;
        const count = p.completedDetails > 0 ? ' (' + p.completedDetails + '/' + p.totalJobs + ')' : '';
        opt.textContent = icon + label + count;
        sel.appendChild(opt);
      }
      if (runningProj) sel.value = runningProj.id;
      else if (val && projects.find(p => p.id === val)) sel.value = val;
      else currentProjectId = null;
      updateUI();
    } catch (e) {
      statusEl.textContent = '连接爬虫失败';
      statusEl.className = 'ps-status';
    }
  }

  let currentProjectId = null;

  // ---- 更新界面 ----
  function updateUI() {
    const proj = projects.find(p => p.id === (sel.value || currentProjectId));
    if (!proj) {
      progressEl.style.display = 'none';
      statusEl.textContent = '待机中';
      statusEl.className = 'ps-status idle';
      projectRow.style.display = '';
      idleActions.style.display = 'none';
      crawlingActions.style.display = 'none';
      doneActions.style.display = 'none';
      newProjectForm.style.display = 'none';
      return;
    }
    currentProjectId = proj.id;
    if (proj.status === 'running') {
      const count = proj.completedDetails > 0 ? proj.completedDetails + '/' + proj.totalJobs : '爬取中';
      statusEl.textContent = count;
      statusEl.className = 'ps-status crawling';
      projectRow.style.display = 'none';
      idleActions.style.display = 'none';
      stopBtn.textContent = '暂停爬取';
      stopBtn.disabled = false;
      crawlingActions.style.display = '';
      doneActions.style.display = 'none';
    } else if (proj.status === 'completed' && proj.totalJobs > 0) {
      statusEl.textContent = '完成 ' + proj.completedDetails + '/' + proj.totalJobs + ' 岗';
      statusEl.className = 'ps-status done';
      progressEl.style.display = 'none';
      projectRow.style.display = '';
      idleActions.style.display = 'none';
      crawlingActions.style.display = 'none';
      viewBtn.textContent = '查看结果';
      rerunBtn.textContent = '重新爬取';
      rerunBtn.disabled = false;
      doneActions.style.display = '';
    } else {
      progressEl.style.display = 'none';
      statusEl.textContent = '待机中';
      statusEl.className = 'ps-status idle';
      projectRow.style.display = '';
      startBtn.textContent = '开始爬取';
      startBtn.disabled = false;
      idleActions.style.display = '';
      crawlingActions.style.display = 'none';
      doneActions.style.display = 'none';
    }
    newProjectForm.style.display = 'none';
  }

  function updateProgress(data) {
    if (!data || data.phase === 'idle' || data.phase === 'paused' || data.phase === 'completed') {
      progressEl.style.display = 'none';
      return;
    }
    progressEl.style.display = 'flex';
    if (data.phase === 'searching') {
      const pct = data.totalPages > 0 ? Math.round((data.currentPage / data.totalPages) * 100) : 0;
      progressFill.style.width = pct + '%';
      progressText.textContent = '搜索中... 第 ' + data.currentPage + '/' + data.totalPages + ' 页 | 已找到 ' + data.totalJobs + ' 个岗位';
      progressDetail.textContent = '';
    } else if (data.phase === 'fetching_details') {
      const pct = data.detailsTotal > 0 ? Math.round((data.detailsCompleted / data.detailsTotal) * 100) : 0;
      progressFill.style.width = pct + '%';
      progressText.textContent = '获取详情中... ' + data.detailsCompleted + '/' + data.detailsTotal;
      var parts = [];
      if (data.currentJob) parts.push(data.currentJob);
      if (data.retryInfo) parts.push(data.retryInfo);
      progressDetail.textContent = parts.join(' | ');
    }
  }

  // ---- 从 background 获取捕获的搜索参数 ----
  function fetchCapturedParams() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ command: 'getSearchParams' }, (resp) => {
        if (resp && resp.params) resolve(resp.params);
        else resolve(null);
      });
    });
  }

  // ---- 更新参数摘要显示 ----
  function updateParamsDisplay(params) {
    if (!params || Object.keys(params).length === 0) {
      paramsDisplay.textContent = '尚未捕获搜索条件，请先在 BOSS 页面执行一次搜索';
      return;
    }
    const parts = [];
    if (params.query) parts.push('关键词: ' + params.query);
    if (params.city) parts.push('城市: ' + params.city);
    if (params.salary) parts.push('薪资: ' + params.salary);
    if (params.experience) parts.push('经验: ' + params.experience);
    if (params.degree) parts.push('学历: ' + params.degree);
    if (params.jobType) parts.push('类型: ' + params.jobType);
    paramsDisplay.textContent = parts.length > 0 ? parts.join(' | ') : '已捕获 ' + Object.keys(params).length + ' 个参数';
  }

  // ---- 选择项目 ----
  sel.addEventListener('change', () => {
    currentProjectId = sel.value || null;
    updateUI();
  });

  refreshBtn.addEventListener('click', loadProjects);

  // ---- 删除项目 ----
  delBtn.addEventListener('click', async () => {
    const id = sel.value;
    if (!id) return;
    const proj = projects.find(p => p.id === id);
    const name = proj ? (proj.name || id) : id;
    if (!confirm('确认删除项目 "' + name + '" ？\n项目文件和进度将被删除，全局岗位池不受影响。')) return;
    try {
      const resp = await fetch(API + '/projects/' + id + '/delete', { method: 'POST' });
      const data = await resp.json();
      if (!data.ok) {
        statusEl.textContent = '删除失败: ' + (data.error || '服务器返回异常');
        return;
      }
      console.log('[删除] 成功:', data);
      sel.value = '';
      currentProjectId = null;
      await loadProjects();
    } catch (e) {
      statusEl.textContent = '删除失败: ' + e.message;
    }
  });

  // ---- 新建项目 ----
  newBtn.addEventListener('click', async () => {
    projectRow.style.display = 'none';
    idleActions.style.display = 'none';
    doneActions.style.display = 'none';
    newProjectForm.style.display = 'flex';
    nameInput.value = '';
    nameInput.focus();
    capturedParams = await fetchCapturedParams();
    updateParamsDisplay(capturedParams);
  });

  cancelNewBtn.addEventListener('click', () => {
    newProjectForm.style.display = 'none';
    updateUI();
  });

  // ---- 重新捕获 ----
  captureBtn.addEventListener('click', async () => {
    captureBtn.disabled = true;
    captureBtn.textContent = '捕获中...';
    capturedParams = await fetchCapturedParams();
    updateParamsDisplay(capturedParams);
    captureBtn.textContent = '重新捕获';
    captureBtn.disabled = false;
  });

  // ---- 创建项目 ----
  createBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    createBtn.disabled = true;
    createBtn.textContent = '创建中...';

    // 优先用 background 捕获的参数，否则 URL 参数兜底
    let apiParams = capturedParams;
    if (!apiParams || Object.keys(apiParams).length === 0) {
      apiParams = Object.fromEntries(new URLSearchParams(window.location.search));
    }

    try {
      const resp = await fetch(API + '/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, apiParams }),
      });
      const data = await resp.json();
      if (data.ok) {
        createBtn.textContent = '已创建';
        setTimeout(async () => {
          createBtn.textContent = '创建';
          createBtn.disabled = false;
          newProjectForm.style.display = 'none';
          await loadProjects();
          sel.value = data.id;
          updateUI();
        }, 500);
      } else {
        createBtn.textContent = '失败: ' + (data.error || '');
        setTimeout(() => { createBtn.textContent = '创建'; createBtn.disabled = false; }, 2000);
      }
    } catch (e) {
      createBtn.textContent = '失败: ' + e.message;
      setTimeout(() => { createBtn.textContent = '创建'; createBtn.disabled = false; }, 2000);
    }
  });

  // ---- 开始爬取 ----
  startBtn.addEventListener('click', () => {
    const id = sel.value;
    if (!id) return;
    startBtn.disabled = true;
    startBtn.textContent = '请求中...';
    chrome.runtime.sendMessage({ command: 'startProject', projectId: id }, (resp) => {
      if (resp && resp.ok) {
        loadProjects();
      } else {
        const reason = resp && resp.error ? resp.error : '连接后台失败';
        startBtn.textContent = '失败: ' + reason;
        setTimeout(() => { startBtn.textContent = '开始爬取'; startBtn.disabled = false; }, 3000);
      }
    });
  });

  // ---- 暂停爬取 ----
  stopBtn.addEventListener('click', () => {
    stopBtn.disabled = true;
    stopBtn.textContent = '暂停中...';
    chrome.runtime.sendMessage({ command: 'stopCrawl' }, (resp) => {
      if (resp && resp.ok) {
        setTimeout(loadProjects, 500);
      } else {
        const reason = resp && resp.error ? resp.error : '连接后台失败';
        stopBtn.textContent = '失败: ' + reason;
        setTimeout(() => { stopBtn.textContent = '暂停爬取'; stopBtn.disabled = false; }, 3000);
      }
    });
  });

  // ---- 查看结果 ----
  viewBtn.addEventListener('click', () => {
    const id = sel.value;
    if (id) window.open(API + '/projects/' + id + '/output');
  });

  // ---- 重新爬取 ----
  rerunBtn.addEventListener('click', () => {
    const id = sel.value;
    if (!id) return;
    rerunBtn.disabled = true;
    rerunBtn.textContent = '请求中...';
    chrome.runtime.sendMessage({ command: 'startProject', projectId: id }, (resp) => {
      if (resp && resp.ok) {
        loadProjects();
      } else {
        rerunBtn.textContent = '失败: ' + (resp && resp.error ? resp.error : '连接后台失败');
        setTimeout(() => { rerunBtn.textContent = '重新爬取'; rerunBtn.disabled = false; }, 3000);
      }
    });
  });

  // ---- 轮询状态 + 进度 ----
  setInterval(() => {
    const proj = projects.find(p => p.id === (sel.value || currentProjectId));
    if (proj && proj.status === 'running') {
      loadProjects();
      fetch(API + '/progress?_=' + Date.now()).then(function(r) { return r.json(); }).then(function(d) { updateProgress(d); }).catch(function() {});
    }
  }, 3000);

  loadProjects();
})();
