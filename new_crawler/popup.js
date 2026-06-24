(function () {
  'use strict';

  // DOM 引用
  var apiBaseUrl  = document.getElementById('apiBaseUrl');
  var apiKey      = document.getElementById('apiKey');
  var model       = document.getElementById('model');
  var systemPrompt = document.getElementById('systemPrompt');
  var saveBtn     = document.getElementById('saveBtn');
  var testBtn     = document.getElementById('testBtn');
  var statusDot   = document.getElementById('statusDot');
  var statusText  = document.getElementById('statusText');

  var STORAGE_KEY = 'aiConfig';

  // ============================================================
  // 状态管理
  // ============================================================
  function setStatus(text, type) {
    statusText.textContent = text;
    statusDot.className = 'status-dot';
    if (type) statusDot.classList.add(type);
  }

  function getFormData() {
    return {
      baseUrl:      apiBaseUrl.value.trim(),
      apiKey:       apiKey.value.trim(),
      model:        model.value.trim(),
      systemPrompt: systemPrompt.value.trim(),
    };
  }

  function setFormData(data) {
    apiBaseUrl.value  = data.baseUrl || '';
    apiKey.value      = data.apiKey || '';
    model.value       = data.model || '';
    systemPrompt.value = data.systemPrompt || '';
  }

  // ============================================================
  // 加载 & 保存
  // ============================================================
  function loadConfig() {
    chrome.storage.local.get(STORAGE_KEY, function (result) {
      var cfg = result[STORAGE_KEY];
      if (cfg) {
        setFormData(cfg);
        setStatus('配置已加载', 'saved');
      } else {
        setStatus('等待配置');
      }
    });
  }

  function saveConfig() {
    var data = getFormData();
    setStatus('保存中...', 'saving');
    chrome.storage.local.set({ aiConfig: data }, function () {
      if (chrome.runtime.lastError) {
        setStatus('保存失败: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      setStatus('✅ 配置已保存', 'saved');
    });
  }

  // ============================================================
  // 测试连接
  // ============================================================
  function testConnection() {
    var data = getFormData();
    if (!data.baseUrl || !data.apiKey || !data.model) {
      setStatus('请先填写完整的 API 配置', 'error');
      return;
    }

    setStatus('测试中...', 'saving');
    var url = data.baseUrl.replace(/\/+$/, '') + '/chat/completions';

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + data.apiKey,
      },
      body: JSON.stringify({
        model:    data.model,
        messages: [{ role: 'user', content: '回复"ok"即可' }],
        max_tokens: 16,
      }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.error?.message || 'HTTP ' + r.status); });
        return r.json();
      })
      .then(function () {
        setStatus('✅ 连接成功，模型可用', 'saved');
      })
      .catch(function (err) {
        setStatus('❌ 连接失败: ' + err.message, 'error');
      });
  }

  // ============================================================
  // 事件绑定
  // ============================================================
  saveBtn.addEventListener('click', saveConfig);
  testBtn.addEventListener('click', testConnection);

  // Enter 快捷保存（不在 textarea 内触发）
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') saveConfig();
  });

  // 启动
  loadConfig();
})();
