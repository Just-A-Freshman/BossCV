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
    var cfg;
    try { cfg = await getConfig(); }
    catch (e) { port.postMessage({ type: 'error', error: '读取配置失败' }); return; }

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
          // 如果之前是 reasoning 阶段，标记切换
          if (isReasoning) {
            // reasoning_content 可能在 content 出现之前就结束了（最后一个 thinking chunk 的 content='' 但不是 null）
            // 但更深层模型可能在 content 出现同时还在发 reasoning
            // 我们只在 content 非空时切换标记
          }
          isReasoning = false;
          fullContent += delta.content;
          port.postMessage({ type: 'token', content: delta.content });
        } else if (delta.reasoning_content === null && delta.content === '' && !finish) {
          // DeepSeek 在切换阶段可能会发一个空 content chunk 标记角色
          // 忽略 role 标记
        }

        if (finish) {
          var elapsed = Date.now() - startTime;
          port.postMessage({
            type: 'done',
            time: elapsed,
          });
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
  // 短消息（非流式：getConfig / testConnection / saveUrls）
  // ============================================================
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === 'getConfig') {
      getConfig().then(function (cfg) { sendResponse({ ok: true, config: cfg }); });
      return true;
    }

    if (msg.type === 'testConnection') {
      var url = (msg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + msg.apiKey,
        },
        body: JSON.stringify({
          model:    msg.model,
          messages: [{ role: 'user', content: '回复"ok"即可' }],
          max_tokens: 16,
          stream: false,
        }),
      })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (e) { throw new Error(e.error?.message || 'HTTP ' + r.status); });
          sendResponse({ ok: true });
        })
        .catch(function (e) { sendResponse({ ok: false, error: e.message }); });
      return true;
    }

    if (msg.type === 'saveUrls') {
      var content = msg.urls.join('\n');
      var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        var filename = 'job-urls-' + Date.now() + '.txt';
        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: true,
        }, function (downloadId) {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ ok: true, filename: filename });
          }
        });
      };
      reader.readAsDataURL(blob);
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
