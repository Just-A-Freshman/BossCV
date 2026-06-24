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
      var jobInfoMsg = ctx.messages.find(function (m) { return m.role === 'user' && m.content.startsWith('【岗位信息简报】'); });
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
  // 7. 获取岗位信息
  // ============================================================
  function fetchJobInfo() {
    if (streaming) return;
    var ctx = getCurrentCtx();
    addSys('正在获取岗位信息...');

    chrome.runtime.sendMessage({ type: 'getConfig' }, function (resp) {
      var basePrompt = (resp && resp.ok && resp.config.systemPrompt)
        ? resp.config.systemPrompt
        : '你是一个面试助手，帮助用户分析岗位要求、优化沟通策略。回答简洁专业，使用中文。';

      // TODO: 方案 C — 从 BOSS直聘 DOM + 网络请求获取真实岗位信息
      var mockJobInfo = [
        '【岗位信息简报】',
        '公司: XX科技有限公司',
        '岗位: 高级前端开发工程师',
        '薪资: 25K-50K·15薪',
        '要求: 5年以上React经验，熟悉TypeScript',
        '福利: 六险一金·弹性工作·股票期权',
      ].join('\n');

      var mockChatLog = '【聊天记录】\nHR: 你好，看到你投递了我们公司的前端岗位\n我: 您好，我对这个岗位很感兴趣\nHR: 方便发一份简历过来吗';

      ctx.systemPrompt = [
        basePrompt,
        '',
        '以下是与当前对话的岗位信息和聊天记录：',
        '',
        mockJobInfo,
        '',
        mockChatLog,
        '',
        '请基于以上信息为用户提供建议。',
      ].join('\n');

      ctx.jobFetched = true;

      // 以用户身份自动发送岗位信息
      addMsg('user', mockJobInfo);
      ctx.messages.push({ role: 'user', content: mockJobInfo });

      // 流式调用 AI
      var messages = [
        { role: 'system', content: ctx.systemPrompt },
        { role: 'user', content: mockJobInfo },
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

      // 更新按钮
      btnFetch.className = 'act-btn disabled';
      btnFetch.disabled = true;
      btnFetch.innerHTML = '发送岗位信息 <span class="badge">✅</span>';
      addSys('岗位信息已获取，可继续对话');
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
