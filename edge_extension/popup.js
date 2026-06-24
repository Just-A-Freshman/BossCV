(function () {
  'use strict';

  // DOM 引用
  var apiBaseUrl   = document.getElementById('apiBaseUrl');
  var baseUrlSelect = document.getElementById('baseUrlSelect');
  var apiKey       = document.getElementById('apiKey');
  var model        = document.getElementById('model');
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

  // 预设下拉选中后自动填充 Base URL
  baseUrlSelect.addEventListener('change', function () {
    if (this.value) {
      apiBaseUrl.value = this.value;
      this.value = ''; // 重置为占位选项，允许重新选择
    }
  });

  // Enter 快捷保存（不在 textarea 内触发）
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') saveConfig();
  });

  // ============================================================
  // 清空所有对话记录
  // ============================================================
  var clearChatBtn = document.getElementById('clearChatBtn');
  clearChatBtn.addEventListener('click', function () {
    if (!confirm('确定清空所有 boss 的对话记录吗？此操作不可撤销。')) return;
    setStatus('清空中...', 'saving');
    chrome.storage.local.get(null, function (items) {
      var keysToRemove = Object.keys(items).filter(function (k) { return k.startsWith('chatCtx_'); });
      if (keysToRemove.length === 0) {
        setStatus('没有对话记录需要清空', 'saved');
        return;
      }
      chrome.storage.local.remove(keysToRemove, function () {
        setStatus('✅ 已清空 ' + keysToRemove.length + ' 条对话记录', 'saved');
      });
    });
  });

  // 启动
  loadConfig();
})();
