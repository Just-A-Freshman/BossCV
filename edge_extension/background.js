// BOSS直聘 AI 面试助手 — Service Worker
(function () {
  'use strict';

  var STORAGE_KEY = 'aiConfig';

  // ============================================================
  // 读取 AI 配置
  // ============================================================
  function getConfig() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(STORAGE_KEY, function (result) {
        var cfg = result[STORAGE_KEY] || {};
        resolve({
          baseUrl:      cfg.baseUrl      || 'https://api.openai.com/v1',
          apiKey:       cfg.apiKey       || '',
          model:        cfg.model        || 'gpt-4o',
          systemPrompt: cfg.systemPrompt || '',
        });
      });
    });
  }

  // ============================================================
  // 流式 AI 对话
  // ============================================================
  async function callAIStream(messages, port) {
    var cfg = await getConfig();

    if (!cfg.apiKey) {
      port.postMessage({ type: 'error', error: '未配置 API Key' });
      return;
    }

    var url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    var startTime = Date.now();

    var resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + cfg.apiKey,
        },
        body: JSON.stringify({
          model:       cfg.model,
          messages:    messages,
          max_tokens:  8192,
          temperature: 0.7,
          stream:      true,
        }),
      });
    } catch (e) {
      port.postMessage({ type: 'error', error: '网络请求失败: ' + e.message });
      return;
    }

    if (!resp.ok) {
      var errBody;
      try { errBody = await resp.json(); } catch (_) { errBody = {}; }
      port.postMessage({ type: 'error', error: errBody.error?.message || 'API 请求失败 (HTTP ' + resp.status + ')' });
      return;
    }

    if (!resp.body) {
      port.postMessage({ type: 'error', error: '浏览器不支持流式读取' });
      return;
    }

    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var fullContent = '';
    var fullReasoning = '';
    var isReasoning = true;  // 默认处于 reasoning 阶段

    while (true) {
      var result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });

      var lines = buffer.split('\n');
      buffer = lines.pop();

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || !line.startsWith('data: ')) continue;
        var data = line.slice(6);
        if (data === '[DONE]') continue;

        var parsed;
        try { parsed = JSON.parse(data); } catch (_) { continue; }
        var choice = parsed.choices?.[0];
        if (!choice) continue;

        var delta = choice.delta || {};
        var finish = choice.finish_reason;

        // reasoning_content（DeepSeek 风格）
        if (delta.reasoning_content) {
          fullReasoning += delta.reasoning_content;
          isReasoning = true;
          port.postMessage({ type: 'thinking', content: delta.reasoning_content });
        }

        // 普通 content
        if (delta.content) {
          isReasoning = false;
          fullContent += delta.content;
          port.postMessage({ type: 'token', content: delta.content });
        }
      }
    }

    // 流结束但没收到 finish_reason
    if (fullContent || fullReasoning) {
      var elapsed = Date.now() - startTime;
      port.postMessage({ type: 'done', time: elapsed });
    }
  }

  // ============================================================
  // 监听 content script 的长连接（流式）
  // ============================================================
  chrome.runtime.onConnect.addListener(function (port) {
    if (port.name !== 'aiStream') return;
    port.onMessage.addListener(function (msg) {
      if (msg.type === 'start') {
        callAIStream(msg.messages, port);
      }
    });
  });

  // ============================================================
  // 短消息（非流式：getConfig / fetchJobDetail / openPhrasesPage / openResumePage）
  // ============================================================
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === 'getConfig') {
      getConfig().then(function (cfg) { sendResponse({ ok: true, config: cfg }); });
      return true;
    }

    if (msg.type === 'openPhrasesPage') {
      chrome.tabs.create({ url: chrome.runtime.getURL('phrases.html') });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'openResumePage') {
      chrome.tabs.create({ url: chrome.runtime.getURL('resume.html') });
      sendResponse({ ok: true });
      return true;
    }

    // ============================================================
    // 岗位详情获取：打开隐藏标签页 → 读取 DOM → 返回数据
    // ============================================================
    if (msg.type === 'fetchJobDetail') {
      var jobUrl = msg.url;
      var chatTabId = sender.tab ? sender.tab.id : null;

      // 存映射：detailTabUrl → { chatTabId, resolve }
      var detailTabId = null;

      // 监听详情页发来的数据
      var timeoutId = setTimeout(function () {
        chrome.runtime.onMessage.removeListener(detailHandler);
        if (detailTabId) chrome.tabs.remove(detailTabId);
        sendResponse({ ok: false, error: '获取岗位详情超时' });
      }, 20000);

      var detailHandler = function (detailMsg, detailSender) {
        if (detailMsg.type === 'jobDetailData' && detailSender.tab && detailSender.tab.id === detailTabId) {
          clearTimeout(timeoutId);  // 取消超时
          // 转发数据到聊天页
          if (chatTabId) {
            chrome.tabs.sendMessage(chatTabId, { type: 'jobDetailReady', data: detailMsg.data });
          }
          // 关闭详情页
          if (detailTabId) chrome.tabs.remove(detailTabId);
          // 清理
          chrome.runtime.onMessage.removeListener(detailHandler);
          sendResponse({ ok: true });
        }
      };
      chrome.runtime.onMessage.addListener(detailHandler);

      // 打开隐藏标签页
      chrome.tabs.create({ url: jobUrl, active: false }, function (tab) {
        detailTabId = tab.id;
      });

      return true;
    }
  });

  console.log('[BOSS AI] Service Worker 已就绪');
})();
