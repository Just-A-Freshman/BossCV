(function () {
  'use strict';

  if (!location.hostname.includes('zhipin.com') || !location.pathname.includes('/chat')) return;

  // ============================================================
  // 0. 工具函数
  // ============================================================
  function getChatId() {
    var m = location.pathname.match(/\/chat\/([^/?#]+)/) || location.hash.match(/chatId[=:]([^&]+)/);
    return m ? m[1] : '__default__';
  }

  // ============================================================
  // 1. 对话上下文管理器
  // ============================================================
  var contexts = {};

  function getCtx(chatId) {
    if (!contexts[chatId]) {
      contexts[chatId] = {
        jobFetched: false,
        messages: [],
        systemPrompt: '',
      };
    }
    return contexts[chatId];
  }

  function getCurrentCtx() {
    return getCtx(getChatId());
  }

  var lastChatId = null;

  function pollChatChange() {
    var cur = getChatId();
    if (cur !== lastChatId) {
      lastChatId = cur;
      refreshPanel();
    }
  }

  var observer = new MutationObserver(function () { pollChatChange(); });
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(pollChatChange, 800);

  // ============================================================
  // 2. 挤压页面
  // ============================================================
  (function squeezePage() {
    var s = document.createElement('style');
    s.id = 'boss-ai-squeeze';
    s.textContent = 'html,body{overflow-x:hidden!important}';
    document.head.appendChild(s);

    setInterval(function () {
      var wrap = document.querySelector('#wrap');
      if (!wrap) return;
      var squeeze = Math.max(200, window.innerWidth - 1020);
      squeeze = Math.min(squeeze, 620);

      wrap.style.setProperty('width', 'calc(100vw - ' + squeeze + 'px)', 'important');
      wrap.style.setProperty('margin-left', '0', 'important');
      wrap.style.setProperty('margin-right', 'auto', 'important');
      wrap.style.setProperty('max-width', 'none', 'important');
      wrap.style.setProperty('min-width', '0', 'important');

      var chain = '.main-wrap,#main.inner,#container,.chat-container,.chat-wrap'.split(',');
      chain.forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) el.style.setProperty('max-width', '100%', 'important');
      });
    }, 200);
  })();

  // ============================================================
  // 3. 构建手机风格 AI 面板（含深度思考样式）
  // ============================================================
  var PANEL_W = 400;
  var TOP = 56;

  var host = document.createElement('div');
  host.id = 'boss-ai-host';
  var root = host.attachShadow({ mode: 'closed' });

  var style = document.createElement('style');
  style.textContent = [
    ':host{all:initial;display:block}',
    '.phone{position:fixed;top:' + TOP + 'px;right:10px;width:' + PANEL_W + 'px;height:calc(100vh - ' + (TOP + 10) + 'px);background:#f5f6f8;border-radius:28px;padding:10px;box-shadow:-6px 0 30px rgba(0,0,0,0.15);border-left:1px solid rgba(0,0,0,0.08);z-index:999999;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}',
    '.screen{flex:1;min-height:0;background:#f5f6f8;border-radius:20px;display:flex;flex-direction:column;overflow:hidden}',
    '.canvas{flex:1;min-height:0;padding:16px 12px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;background:#fff}',
    '.canvas::-webkit-scrollbar{width:4px}',
    '.canvas::-webkit-scrollbar-thumb{background:#ddd;border-radius:2px}',
    '.row{display:flex;align-items:flex-start;gap:8px;max-width:88%}',
    '.row.ai{align-self:flex-start}',
    '.row.user{align-self:flex-end;flex-direction:row-reverse}',
    '.avatar{width:30px;height:30px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600}',
    '.row.ai .avatar{background:#e8f0fe;color:#4f7cff}',
    '.row.user .avatar{background:#4f7cff;color:#fff}',
    '.bubble{padding:10px 14px;font-size:13px;line-height:1.55;font-family:-apple-system,"Microsoft YaHei","PingFang SC",sans-serif;word-break:break-word;white-space:pre-wrap}',
    '.row.ai .bubble{background:#f0f2f5;color:#333;border-radius:14px 14px 14px 4px}',
    '.row.user .bubble{background:#4f7cff;color:#fff;border-radius:14px 14px 4px 14px}',
    // --- 深度思考样式 ---
    '.thinking-block{margin:0 0 6px 0;font-size:12px}',
    '.thinking-block summary{cursor:pointer;color:#8b5cf6;font-weight:500;padding:4px 6px;border-radius:6px;background:#f5f3ff;user-select:none;font-size:12px;display:inline-flex;align-items:center;gap:4px}',
    '.thinking-block summary:hover{background:#ede9fe}',
    '.thinking-text{padding:8px 10px;margin-top:4px;background:#faf9ff;border-left:2px solid #c4b5fd;border-radius:0 6px 6px 0;font-size:12px;color:#666;line-height:1.5;white-space:pre-wrap;max-height:200px;overflow-y:auto}',
    '.response-time{font-size:11px;color:#aaa;margin-top:4px;text-align:right}',
    // --- 光标闪烁 ---
    '.cursor::after{content:"|";animation:blink .8s infinite}',
    '@keyframes blink{50%{opacity:0}}',
    // --- 其余 ---
    '.sys-msg{align-self:center;font-size:12px;color:#999;padding:6px 0;font-family:-apple-system,"Microsoft YaHei",sans-serif}',
    '.sys-msg.error{color:#ff4d4f}',
    '.bottom{background:#fff;border-top:1px solid #eee;padding:10px 12px}',
    '.input-row{display:flex;align-items:center;gap:8px}',
    '.input-row input{flex:1;height:36px;border:1px solid #e0e0e0;border-radius:18px;padding:0 14px;font-size:13px;font-family:-apple-system,"Microsoft YaHei","PingFang SC",sans-serif;outline:none;background:#f8f9fa;transition:border-color .2s;box-sizing:border-box}',
    '.input-row input:focus{border-color:#4f7cff;background:#fff}',
    '.input-row input::placeholder{color:#bbb}',
    '.input-row .send{width:36px;height:36px;border-radius:50%;border:none;background:#4f7cff;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;flex-shrink:0}',
    '.input-row .send:active{transform:scale(0.92)}',
    '.input-row .send:hover{background:#3b66e0}',
    '.actions{display:flex;justify-content:center;gap:24px;margin-top:10px}',
    '.act-btn{background:none;border:none;font-size:13px;cursor:pointer;padding:4px 6px;font-family:-apple-system,"Microsoft YaHei","PingFang SC",sans-serif;transition:color .15s}',
    '.act-btn.enabled{color:#4f7cff}',
    '.act-btn.enabled:hover{color:#3b66e0}',
    '.act-btn.disabled{color:#c0c4cc;cursor:not-allowed}',
    '.act-btn .badge{font-size:11px;margin-left:2px}',
    '.input-row input.disabled{background:#f0f0f0;color:#bbb;cursor:not-allowed}',
    '@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
    '.row,.sys-msg{animation:fadeIn .25s ease}',
  ].join('');
  root.appendChild(style);

  var phone = document.createElement('div');
  phone.className = 'phone';
  phone.innerHTML = [
    '<div class="screen">',
    '  <div class="canvas" id="canvas">',
    '    <div class="sys-msg">AI 面试助手已就绪</div>',
    '    <div class="row ai">',
    '      <div class="avatar">AI</div>',
    '      <div class="bubble">你好！点击下方「发送岗位信息」，我可以帮你分析当前岗位的要求，并建议沟通策略。</div>',
    '    </div>',
    '  </div>',
    '  <div class="bottom">',
    '    <div class="input-row">',
    '      <input type="text" placeholder="输入消息..." id="chatInput" />',
    '      <button class="send" id="sendBtn">↑</button>',
    '    </div>',
    '    <div class="actions">',
    '      <button class="act-btn enabled" id="btnFetch">发送岗位信息</button>',
    '      <button class="act-btn enabled" id="btnResume">定制简历</button>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('\n');
  root.appendChild(phone);
  document.body.appendChild(host);

  // ============================================================
  // 4. DOM 引用 & 基础方法
  // ============================================================
  var canvasEl  = root.getElementById('canvas');
  var inputEl   = root.getElementById('chatInput');
  var sendBtn   = root.getElementById('sendBtn');
  var btnFetch  = root.getElementById('btnFetch');
  var btnResume = root.getElementById('btnResume');

  function addMsg(role, text) {
    var d = document.createElement('div');
    d.className = 'row ' + role;
    d.innerHTML = '<div class="avatar">' + (role === 'ai' ? 'AI' : '我') + '</div><div class="bubble">' + escHtml(text) + '</div>';
    canvasEl.appendChild(d);
    canvasEl.scrollTop = canvasEl.scrollHeight;
  }

  function addSys(text, err) {
    var d = document.createElement('div');
    d.className = 'sys-msg' + (err ? ' error' : '');
    d.textContent = text;
    canvasEl.appendChild(d);
    canvasEl.scrollTop = canvasEl.scrollHeight;
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  }

  function clearCanvas() {
    canvasEl.innerHTML = '';
  }

  // ============================================================
  // 4b. 流式 AI 气泡控制器
  // ============================================================
  function createStreamBubble() {
    var row = document.createElement('div');
    row.className = 'row ai';
    row.innerHTML = '<div class="avatar">AI</div><div class="bubble"></div>';
    var bubble = row.querySelector('.bubble');
    canvasEl.appendChild(row);
    canvasEl.scrollTop = canvasEl.scrollHeight;

    var hasThinking = false;
    var thinkingDetails = null;
    var thinkingText = null;
    var responseText = null;
    var timeEl = null;
    var cursorSpan = null;
    var streamingDone = false;

    // 添加光标
    function ensureCursor() {
      if (!cursorSpan) {
        cursorSpan = document.createElement('span');
        cursorSpan.className = 'cursor';
        bubble.appendChild(cursorSpan);
      }
    }

    function removeCursor() {
      if (cursorSpan) { cursorSpan.remove(); cursorSpan = null; }
    }

    return {
      appendThinking: function (text) {
        if (!hasThinking) {
          hasThinking = true;
          thinkingDetails = document.createElement('details');
          thinkingDetails.className = 'thinking-block';
          // 默认收起
          var summary = document.createElement('summary');
          summary.textContent = '🧠 深度思考';
          thinkingDetails.appendChild(summary);
          thinkingText = document.createElement('div');
          thinkingText.className = 'thinking-text';
          thinkingDetails.appendChild(thinkingText);
          bubble.appendChild(thinkingDetails);
        }
        thinkingText.textContent += text;
        canvasEl.scrollTop = canvasEl.scrollHeight;
      },

      appendContent: function (text) {
        if (!responseText) {
          responseText = document.createElement('span');
          bubble.insertBefore(responseText, cursorSpan || null);
        }
        responseText.textContent += text;
        ensureCursor();
        canvasEl.scrollTop = canvasEl.scrollHeight;
      },

      finalize: function (timeMs) {
        streamingDone = true;
        removeCursor();
        var seconds = (timeMs / 1000).toFixed(1);
        timeEl = document.createElement('div');
        timeEl.className = 'response-time';
        timeEl.textContent = '⏱ 回复用时 ' + seconds + 's';
        bubble.appendChild(timeEl);
        canvasEl.scrollTop = canvasEl.scrollHeight;
      },

      getElement: function () { return row; },
      isDone: function () { return streamingDone; },
    };
  }

  // ============================================================
  // 5. 刷新面板（对话切换时重建）
  // ============================================================
  function refreshPanel() {
    var ctx = getCurrentCtx();
    clearCanvas();

    addSys('AI 面试助手已就绪');
    addMsg('ai', '你好！点击下方「发送岗位信息」，我可以帮你分析当前岗位的要求，并建议沟通策略。');

    if (ctx.jobFetched) {
      var jobInfoMsg = ctx.messages.find(function (m) { return m.role === 'user' && (m.content.startsWith('【岗位信息简报】') || m.content.startsWith('【页面岗位')); });
      if (jobInfoMsg) addMsg('user', jobInfoMsg.content);
      var aiReply = ctx.messages.find(function (m) { return m.role === 'assistant'; });
      if (aiReply) addMsg('ai', aiReply.content);
      var rest = ctx.messages.slice(2);
      rest.forEach(function (m) { addMsg(m.role === 'assistant' ? 'ai' : 'user', m.content); });

      btnFetch.className = 'act-btn disabled';
      btnFetch.disabled = true;
      btnFetch.innerHTML = '发送岗位信息 <span class="badge">✅</span>';
    } else {
      btnFetch.className = 'act-btn enabled';
      btnFetch.disabled = false;
      btnFetch.innerHTML = '发送岗位信息';
    }

    inputEl.className = '';
    inputEl.disabled = false;
    inputEl.placeholder = '输入消息...';
  }

  // ============================================================
  // 6. 流式 AI 对话
  // ============================================================
  var cachedBasePrompt = null;
  var streaming = false; // 是否正在流式输出

  function ensureBasePrompt(cb) {
    if (cachedBasePrompt) { cb(cachedBasePrompt); return; }
    chrome.runtime.sendMessage({ type: 'getConfig' }, function (resp) {
      cachedBasePrompt = (resp && resp.ok && resp.config.systemPrompt) || null;
      cb(cachedBasePrompt);
    });
  }

  function disableInput(placeholder) {
    inputEl.className = 'disabled';
    inputEl.disabled = true;
    inputEl.value = '';
    inputEl.placeholder = placeholder || 'AI 回复中...';
  }

  function enableInput() {
    inputEl.className = '';
    inputEl.disabled = false;
    inputEl.value = '';
    inputEl.placeholder = '输入消息...';
    inputEl.focus();
  }

  function askAI(userMsg) {
    if (streaming) return;
    var ctx = getCurrentCtx();

    ensureBasePrompt(function (userBasePrompt) {
      var systemMsg;
      if (ctx.jobFetched && ctx.systemPrompt) {
        systemMsg = ctx.systemPrompt;
      } else {
        systemMsg = userBasePrompt || '你是一个面试助手，回答简洁专业，使用中文。当前用户还未获取岗位信息，你可以建议用户先获取岗位信息。';
      }

      var messages = [
        { role: 'system', content: systemMsg },
      ].concat(ctx.messages.slice(-20));

      messages.push({ role: 'user', content: userMsg });

      // 显示用户消息
      addMsg('user', userMsg);
      ctx.messages.push({ role: 'user', content: userMsg });

      // 创建流式气泡
      var ctrl = createStreamBubble();
      streaming = true;
      disableInput();

      // 建立长连接
      var port = chrome.runtime.connect({ name: 'aiStream' });
      var replyBuffer = '';

      port.onMessage.addListener(function (msg) {
        if (msg.type === 'thinking') {
          ctrl.appendThinking(msg.content);
        } else if (msg.type === 'token') {
          ctrl.appendContent(msg.content);
          replyBuffer += msg.content;
        } else if (msg.type === 'done') {
          ctrl.finalize(msg.time);
          ctx.messages.push({ role: 'assistant', content: replyBuffer });
          streaming = false;
          enableInput();
          port.disconnect();
        } else if (msg.type === 'error') {
          ctrl.finalize(0); // 显示时间
          addSys('AI 回复失败: ' + msg.error, true);
          streaming = false;
          enableInput();
          port.disconnect();
        }
      });

      port.postMessage({ type: 'start', messages: messages });
    });
  }

  // ============================================================
  // 7. 收集岗位 URL（调试阶段 — 通过 main-world 脚本搜索 Vue 数据）
  // ============================================================

  // 注入 main-world 辅助脚本（通过 web_accessible_resources 绕过 CSP）
  function injectMainWorldHelper() {
    return new Promise(function (resolve, reject) {
      // 防止重复注入
      if (document.querySelector('#boss-ai-mw-helper')) {
        resolve();
        return;
      }

      var timeout = setTimeout(function () {
        reject(new Error('main-world 脚本超时（15s）'));
      }, 15000);

      var handler = function (e) {
        if (e.detail && e.detail.rawIds) {
          clearTimeout(timeout);
          document.removeEventListener('__bossFindResult', handler);
          window.__bossFindResult = e.detail; // 缓存
          resolve(e.detail);
        }
      };
      document.addEventListener('__bossFindResult', handler);

      var s = document.createElement('script');
      s.id = 'boss-ai-mw-helper';
      s.src = chrome.runtime.getURL('main-world-helper.js');
      s.onerror = function () {
        clearTimeout(timeout);
        reject(new Error('main-world 脚本加载失败'));
      };
      document.documentElement.appendChild(s);
    });
  }

  function collectJobUrls() {
    var lines = [];
    var rawIds = [];

    // ---- 7a. 搜索所有 <a> 标签 ----
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.href;
      if (!href || href === '#' || href.startsWith('javascript:')) return;
      if (href.includes('/job_detail/')) {
        lines.push('【<a>】' + href + '  (' + (a.textContent || '').trim() + ')');
      }
    });

    // ---- 7b. 从缓存的 main-world 结果中提取 ----
    var mwResult = window.__bossFindResult;
    if (mwResult) {
      if (mwResult.rawIds && mwResult.rawIds.length > 0) {
        mwResult.rawIds.forEach(function (item) {
          rawIds.push(item);
        });
      }
      if (mwResult.results) {
        for (var rk in mwResult.results) {
          lines.push('【' + rk + '】' + mwResult.results[rk]);
        }
      }
      if (mwResult.componentTree && mwResult.componentTree.length > 0) {
        lines.push('');
        lines.push('=== Vue 组件树（深度 <= 5） ===');
        lines.push('(共 ' + mwResult.attempts + ' 次尝试)');
        // 组树成层级
        var lastDepth = 0;
        mwResult.componentTree.forEach(function (c) {
          var indent = '';
          for (var di = 0; di < c.depth; di++) indent += '  ';
          lines.push(indent + '<' + (c.name || '?') + '> ' + (c.tag || ''));
        });
      }
    }

    // ---- 7c. 检查 URL 参数 ----
    if (location.search) lines.push('【URL search】' + location.search);
    if (location.hash) lines.push('【URL hash】' + location.hash);

    // ---- 7d. 检查 data-* 属性 ----
    document.querySelectorAll('[ka="geek_chat_job_detail"]').forEach(function (el, idx) {
      for (var ai = 0; ai < el.attributes.length; ai++) {
        var attr = el.attributes[ai];
        if (attr.name !== 'class' && attr.name !== 'ka') {
          lines.push('【attr】geek_chat_job_detail[' + idx + '] ' + attr.name + ' = ' + attr.value);
        }
      }
    });

    // ---- 7e. 构造 URL —— 匹配精确 key，避免 encryptBossId 误匹配 ----
    var encryptJobId = null;
    var securityId = null;
    rawIds.forEach(function (item) {
      // 精确匹配 encryptJobId（不是 encryptBossId）
      if (!encryptJobId && item.key === 'encryptJobId') encryptJobId = item.value;
      // 备选: 包含 'encryptJobId' 但不是 'encryptBossId'
      if (!encryptJobId && item.key.toLowerCase() === 'encryptjobid') encryptJobId = item.value;
      // securityId
      if (!securityId && item.key === 'securityId') securityId = item.value;
    });

    if (encryptJobId || securityId) {
      lines.push('');
      lines.push('=== 构造的 URL ===');
      if (encryptJobId) {
        var url = 'https://www.zhipin.com/job_detail/' + encryptJobId + '.html';
        if (securityId) url += '?securityId=' + encodeURIComponent(securityId);
        lines.push(url);
      }
      if (!encryptJobId && securityId) {
        lines.push('https://www.zhipin.com/job_detail/{encryptJobId}.html?securityId=' + encodeURIComponent(securityId));
      }
    }

    // ---- 7f. 原始 ID 数据 ----
    if (rawIds.length > 0) {
      lines.push('');
      lines.push('=== 原始 ID 数据 ===');
      rawIds.forEach(function (item) {
        lines.push(item.source + ' = ' + item.value);
      });
    } else {
      lines.push('');
      lines.push('(未找到任何 job ID 数据)');
      lines.push('可能的 Vue 根实例数: ' + (mwResult && mwResult.results ? mwResult.results.VueRootsFound : 'N/A'));
    }

    return lines;
  }

  // ============================================================
  // 7g. 获取岗位信息（完整流程：提取 ID → 打开隐藏标签页 → 读取详情 → AI 对话）
  // ============================================================
  function extractJobIds(mwData) {
    var ids = { encryptJobId: null, securityId: null };
    if (!mwData || !mwData.rawIds) return ids;
    mwData.rawIds.forEach(function (item) {
      if (!ids.encryptJobId && item.key === 'encryptJobId') ids.encryptJobId = item.value;
      if (!ids.securityId && item.key === 'securityId') ids.securityId = item.value;
    });
    return ids;
  }

  function buildJobUrl(ids) {
    if (!ids.encryptJobId) return null;
    var url = 'https://www.zhipin.com/job_detail/' + ids.encryptJobId + '.html';
    if (ids.securityId) url += '?securityId=' + encodeURIComponent(ids.securityId);
    return url;
  }

  function fetchJobInfo() {
    if (streaming) return;
    var ctx = getCurrentCtx();
    addSys('正在注入脚本获取岗位标识...');

    injectMainWorldHelper().then(function (mwData) {
      var ids = extractJobIds(mwData);
      var jobUrl = buildJobUrl(ids);

      if (!jobUrl) {
        addSys('⚠️ 未能提取到岗位 ID，尝试 DOM 扫描...', true);
        // 降级：扫描 DOM
        var lines = collectJobUrls();
        addMsg('user', '【扫描结果】\n' + lines.join('\n'));
        chrome.runtime.sendMessage({ type: 'saveUrls', urls: lines });
        btnFetch.className = 'act-btn enabled';
        btnFetch.disabled = false;
        return;
      }

      addSys('✅ 已获取岗位标识，正在打开详情页...');

      // 设置一次性监听器接收详情数据
      var detailListener = function (msg) {
        if (msg.type === 'jobDetailReady') {
          clearTimeout(timeoutId);  // 取消超时
          chrome.runtime.onMessage.removeListener(detailListener);

          var data = msg.data;
          if (!data || data.error || !data.title) {
            addSys('⚠️ 获取岗位详情失败: ' + (data ? (data.error || '数据为空') : '未知错误'), true);
            btnFetch.className = 'act-btn enabled';
            btnFetch.disabled = false;
            return;
          }

          // 构建岗位信息（匹配 job_detail_output.txt 风格，去掉 banner）
          var jobInfo = [
            '```',
            '【岗位基本信息】',
            '职位名称：' + (data.title || '未知'),
            '薪资范围：' + (data.salary || '未知'),
            '公司名称：' + (data.company || '未知'),
            '',
            '【公司基本信息】',
            '融资阶段：' + (data.stage || '未知'),
            '人员规模：' + (data.scale || '未知'),
            '所属行业：' + (data.industry || '未知'),
            '',
            '【岗位描述】',
            (data.description || '无'),
            '',
            '【公司介绍】',
            (data.companyIntro || '无'),
            '',
          ].join('\n');

          // 工商信息
          if (data.bizInfo && data.bizInfo.length > 0) {
            jobInfo += '\n【工商信息】\n' + data.bizInfo.join('\n') + '\n';
          }

          jobInfo += '\n【工作地址】\n' + (data.address || '未知') + '\n';

          // 标签信息
          var extras = [];
          if (data.skills && data.skills.length > 0) extras.push('技能要求：' + data.skills.join('、'));
          if (data.welfare && data.welfare.length > 0) extras.push('福利待遇：' + data.welfare.join('、'));
          if (extras.length > 0) {
            jobInfo += '\n' + extras.join('\n') + '\n';
          }

          jobInfo += '```\n\n';
          jobInfo += '了解完这个岗位信息后，只需回复：`我已经对该岗位有了全面理解。等待您的问题！`即可';

          // 获取用户的系统提示词配置
          chrome.runtime.sendMessage({ type: 'getConfig' }, function (resp) {
            var basePrompt = (resp && resp.ok && resp.config.systemPrompt) || '你是一个面试助手，帮助用户分析岗位要求、优化沟通策略。回答简洁专业，使用中文。';

            // 构建 system prompt
            ctx.systemPrompt = [
              basePrompt,
              '',
              '以下是与当前对话的完整岗位信息：',
              '',
              jobInfo,
              '',
              '请基于以上信息为用户提供建议。注意：用户可能也会问你与岗位相关的问题。保持对话自然。',
            ].join('\n');

            ctx.jobFetched = true;
            ctx.messages = [];

            // 以用户身份自动发送岗位信息
            addMsg('user', jobInfo);
            ctx.messages.push({ role: 'user', content: jobInfo });

            // 调用 AI
            var messages = [
              { role: 'system', content: ctx.systemPrompt },
              { role: 'user', content: jobInfo },
            ];

            var ctrl = createStreamBubble();
            streaming = true;
            disableInput();

            var port = chrome.runtime.connect({ name: 'aiStream' });
            var replyBuffer = '';

            port.onMessage.addListener(function (msg) {
              if (msg.type === 'thinking') {
                ctrl.appendThinking(msg.content);
              } else if (msg.type === 'token') {
                ctrl.appendContent(msg.content);
                replyBuffer += msg.content;
              } else if (msg.type === 'done') {
                ctrl.finalize(msg.time);
                ctx.messages.push({ role: 'assistant', content: replyBuffer });
                streaming = false;
                enableInput();
                port.disconnect();
              } else if (msg.type === 'error') {
                ctrl.finalize(0);
                addSys('AI 回复失败: ' + msg.error, true);
                streaming = false;
                enableInput();
                port.disconnect();
              }
            });

            port.postMessage({ type: 'start', messages: messages });

            btnFetch.className = 'act-btn disabled';
            btnFetch.disabled = true;
            btnFetch.innerHTML = '发送岗位信息 <span class="badge">✅</span>';
            addSys('岗位信息已获取，可继续对话');
          });
        }
      };
      chrome.runtime.onMessage.addListener(detailListener);

      // 超时清理
      var timeoutId = setTimeout(function () {
        chrome.runtime.onMessage.removeListener(detailListener);
        addSys('⚠️ 获取岗位详情超时（20s）', true);
        btnFetch.className = 'act-btn enabled';
        btnFetch.disabled = false;
      }, 20000);

      // 发送请求给 background 打开隐藏标签页
      chrome.runtime.sendMessage({ type: 'fetchJobDetail', url: jobUrl }, function (resp) {
        if (resp && !resp.ok) {
          clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(detailListener);
          addSys('⚠️ 打开详情页失败: ' + (resp.error || '未知错误'), true);
          btnFetch.className = 'act-btn enabled';
          btnFetch.disabled = false;
        }
      });

    }).catch(function (err) {
      addSys('⚠️ 脚本注入失败: ' + err.message, true);
    });
  }

  // ============================================================
  // 8. 事件绑定
  // ============================================================
  btnFetch.addEventListener('click', function () {
    if (this.disabled) return;
    fetchJobInfo();
  });

  btnResume.addEventListener('click', function () {
    addSys('简历定制功能开发中...');
  });

  function handleSend() {
    var t = inputEl.value.trim();
    if (!t) return;
    inputEl.value = '';
    askAI(t);
  }

  sendBtn.addEventListener('click', handleSend);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // ============================================================
  // 9. 启动
  // ============================================================
  lastChatId = getChatId();
  refreshPanel();
  console.log('[BOSS AI] 面板已注入，chatId=' + lastChatId);
})();
