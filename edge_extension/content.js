(function () {
  'use strict';

  if (!location.hostname.includes('zhipin.com') || !location.pathname.includes('/chat')) return;

  // ============================================================
  // 0. 工具函数
  // ============================================================
  function getChatId() {
    var m = location.pathname.match(/\/chat\/([^/?#]+)/) || location.hash.match(/chatId[=:]([^&]+)/);
    var base = m ? m[1] : '__default__';
    // 附加当前对话的boss/岗位标识，每个boss有独立的AI对话
    var tag = getConversationTag();
    if (tag && tag !== base) return base + '_' + tag.replace(/[^a-zA-Z0-9一-鿿]/g, '').slice(0, 40);
    return base;
  }

  // 从DOM提取当前活跃对话的唯一标识（boss名称/岗位），用于区分不同boss
  function getConversationTag() {
    // 优先使用 ka 岗位详情标识（不受筛选器"全部/仅沟通"影响）
    var jobEl = document.querySelector(
      '[class*="active"] [ka="geek_chat_job_detail"],[class*="selected"] [ka="geek_chat_job_detail"]'
    ) || document.querySelector('[ka="geek_chat_job_detail"]');
    if (jobEl) {
      var j = jobEl.textContent.replace(/\s+/g, '').trim().slice(0, 40);
      if (j && j.length > 2) return j;
    }
    // 1. 找侧边栏中被选中的对话项
    var chatItem = document.querySelector(
      '[class*="active"] [class*="title"],[class*="active"] [class*="name"],' +
      '[class*="selected"] [class*="title"],[class*="selected"] [class*="name"],' +
      '[class*="current"] [class*="title"],[class*="current"] [class*="name"]'
    );
    if (!chatItem) {
      chatItem = document.querySelector(
        '[class*="chat-item"].active,[class*="chat-item"].selected,' +
        '[class*="geek-item"].active,[class*="geek-item"].selected'
      );
    }
    if (chatItem) {
      var t = chatItem.textContent.replace(/\s+/g, '').trim().slice(0, 40);
      if (t && t.length > 2) return t;
    }
    // 2. 找聊天头部区域——排除占位文案
    var headerEl = document.querySelector(
      '[class*="chat-header"],[class*="dialog-header"],' +
      '[class*="im-header"],[class*="message-header"]'
    );
    if (headerEl && headerEl.offsetWidth > 0) {
      var h = headerEl.textContent.replace(/\s+/g, '').trim().slice(0, 40);
      if (h && h.length > 2 && !/请选择|暂无|选择会话|聊天/.test(h)) return h;
    }
    return '';
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

  // ============================================================
  // 1b. 持久化：保存/加载对话上下文到 chrome.storage.local
  // ============================================================
  function saveCurrentCtx() {
    var chatId = getChatId();
    var ctx = contexts[chatId];
    if (!ctx) return;
    var key = 'chatCtx_' + chatId;
    chrome.storage.local.set({ [key]: {
      jobFetched: ctx.jobFetched,
      messages: ctx.messages.slice(-100),
      systemPrompt: ctx.systemPrompt,
    }});
  }

  function loadCurrentCtx(chatId, callback) {
    var key = 'chatCtx_' + chatId;
    chrome.storage.local.get(key, function (result) {
      var data = result[key];
      if (data) {
        var ctx = getCtx(chatId);
        ctx.jobFetched = data.jobFetched || false;
        ctx.messages = data.messages || [];
        ctx.systemPrompt = data.systemPrompt || '';
      }
      if (callback) callback();
    });
  }

  var loadedChatIds = {};
  var lastChatId = null;

  // 对话切换（由 MutationObserver 快速响应，不含可见性检测）
  function reloadChat() {
    var cur = getChatId();
    if (cur === lastChatId) return;
    // 切换对话时清除 main-world 缓存的搜索结果
    var oldHelper = document.querySelector('#boss-ai-mw-helper');
    if (oldHelper) oldHelper.remove();
    window.__bossFindResult = undefined;

    lastChatId = cur;
    if (!loadedChatIds[cur]) {
      loadCurrentCtx(cur, function () {
        loadedChatIds[cur] = true;
        refreshPanel();
      });
    } else {
      refreshPanel();
    }
  }

  // 完整轮询（含可见性检测，800ms 缓冲确保 DOM 稳定）
  function pollChatChange() {
    setPanelVisible(hasActiveChat());
    reloadChat();
  }

  // ============================================================
  // 1c. 检测当前是否有活跃对话（未选会话时隐藏AI面板）
  // ============================================================
  function hasActiveChat() {
    // BOSS直聘：无选中对话时固定显示此占位文案
    return document.body.textContent.indexOf('与您进行过沟通的 Boss 都会在左侧列表中显示') === -1;
  }

  var panelActive = false;
  var rightBottomEl = null;
  var savedRightBottomZ = null;

  function setPanelVisible(visible) {
    if (visible === panelActive || !host) return;
    panelActive = visible;
    host.style.display = visible ? '' : 'none';

    // 控制右下角浮动栏的层级，避免遮挡 AI 面板
    if (visible) {
      if (!rightBottomEl) rightBottomEl = document.querySelector('.right-bottom-fixed');
      if (rightBottomEl) {
        savedRightBottomZ = rightBottomEl.style.zIndex || '';
        rightBottomEl.style.setProperty('z-index', '1', 'important');
      }
    } else {
      if (rightBottomEl) {
        if (savedRightBottomZ) {
          rightBottomEl.style.zIndex = savedRightBottomZ;
        } else {
          rightBottomEl.style.removeProperty('z-index');
        }
      }
    }
  }

  // MutationObserver 只处理对话切换，不做可见性检测（避免 DOM 未就绪时误判）
  var observer = new MutationObserver(function () { reloadChat(); });
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(pollChatChange, 800);

  // ============================================================
  // 2. 挤压页面（仅面板可见时生效）
  // ============================================================
  (function squeezePage() {
    setInterval(function () {
      var wrap = document.querySelector('#wrap');
      if (!wrap) return;

      if (!panelActive) {
        // 无活跃对话时恢复页面原始布局
        wrap.style.removeProperty('width');
        wrap.style.removeProperty('margin-left');
        wrap.style.removeProperty('margin-right');
        wrap.style.removeProperty('max-width');
        wrap.style.removeProperty('min-width');
        return;
      }

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

  // 一次性注入 CSS，强制 BOSS直聘输入框换行（浏览器原生管理，不轮询）
  (function injectInputFixCSS() {
    var style = document.createElement('style');
    style.textContent = [
      // 输入框容器限宽
      '.chat-editor,.editor-container,[class*="chat-input-area"],[class*="editor_wrap"],[class*="chat-footer"]{min-width:0!important;max-width:100%!important}',
      // 输入框本身强制换行
      '.chat-editor [contenteditable],.editor-container [contenteditable],.chat-footer [contenteditable],[class*="input-area"] [contenteditable]{white-space:pre-wrap!important;word-break:break-word!important;overflow-wrap:break-word!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}',
    ].join(' ');
    document.head.appendChild(style);
  })();

  // ============================================================
  // 3. 构建手机风格 AI 面板（含深度思考样式）
  // ============================================================
  var PANEL_W = 400;
  var TOP = 56;

  var host = document.createElement('div');
  host.id = 'boss-ai-host';
  host.style.display = 'none'; // 初始隐藏，pollChatChange 会在有活跃对话时自动显示
  var root = host.attachShadow({ mode: 'closed' });

  var style = document.createElement('style');
  style.textContent = [
    ':host{all:initial;display:block}',
    '.phone{position:fixed;top:' + TOP + 'px;right:10px;width:' + PANEL_W + 'px;height:calc(100vh - ' + (TOP + 10) + 'px);background:#f5f6f8;border-radius:28px;padding:10px;box-shadow:-6px 0 30px rgba(0,0,0,0.15);border-left:1px solid rgba(0,0,0,0.08);z-index:99;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}',
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
    '.input-row{display:flex;align-items:flex-start;gap:8px;min-width:0}',
    '.input-row textarea{display:block;width:100%;min-width:0;max-width:100%;border:none;outline:none;background:transparent;padding:0;margin:0;font:inherit;color:inherit;resize:none;overflow:hidden;overflow-wrap:break-word;word-break:break-word;box-sizing:border-box}',
    '.input-row textarea::-webkit-scrollbar{width:5px}',
    '.input-row textarea::-webkit-scrollbar-track{background:transparent}',
    '.input-row textarea::-webkit-scrollbar-thumb{background:#ccc;border-radius:3px}',
    '.textarea-wrap{flex:1;min-width:0;border:1px solid #e0e0e0;border-radius:12px;background:#f8f9fa;padding:8px 14px;transition:border-color .2s,background .2s}',
    '.textarea-wrap:focus-within{border-color:#4f7cff;background:#fff}',
    '.textarea-wrap:has(> textarea.disabled){background:#f0f0f0}',
    '.input-row textarea::placeholder{color:#bbb}',
    '.action-row{display:flex;justify-content:flex-end;align-items:center;gap:6px;padding:6px 0 0}',
    '.action-row .send{width:32px;height:32px;border-radius:50%;border:none;background:#4f7cff;color:#fff;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;flex-shrink:0}',
    '.action-row .send:active{transform:scale(0.92)}',
    '.action-row .send:hover{background:#3b66e0}',
    '.act-btn{background:none;border:none;font-size:13px;cursor:pointer;padding:4px 6px;font-family:-apple-system,"Microsoft YaHei","PingFang SC",sans-serif;transition:color .15s}',
    '.act-btn.enabled{color:#4f7cff}',
    '.act-btn.enabled:hover{color:#3b66e0}',
    '.act-btn.disabled{color:#c0c4cc;cursor:not-allowed}',
    '.act-btn .badge{font-size:11px;margin-left:2px}',
    '.input-row textarea.disabled{color:#bbb;cursor:not-allowed}',
    '@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
    '.row,.sys-msg{animation:fadeIn .25s ease}',
    // --- 常用语 ---
    '.phrases-btn-wrap{position:relative;margin-right:auto;display:flex}',
    '.phrases-btn{background:none;border:none;font-size:12px;color:#666;cursor:pointer;padding:4px 8px;border-radius:6px;display:flex;align-items:center;gap:3px;font-family:inherit;transition:background .15s}',
    '.phrases-btn:hover{background:#f0f2f5;color:#333}',
    '.phrases-popup{position:absolute;bottom:calc(100% + 4px);left:0;width:260px;max-height:280px;background:#fff;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.12);border:1px solid #e8e8e8;display:none;flex-direction:column;z-index:100;overflow:hidden}',
    '.phrases-popup.open{display:flex}',
    '.phrases-popup-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 8px;border-bottom:1px solid #f0f0f0;font-size:12px;font-weight:600;color:#333}',
    '.phrases-settings{background:none;border:none;font-size:16px;cursor:pointer;color:#81c784;padding:2px 6px;border-radius:4px;transition:background .15s;line-height:1}',
    '.phrases-settings:hover{background:#e8f5e9;color:#66bb6a}',
    '.phrases-list{flex:1;overflow-y:auto;padding:4px 0}',
    '.phrases-list::-webkit-scrollbar{width:4px}',
    '.phrases-list::-webkit-scrollbar-thumb{background:#ddd;border-radius:2px}',
    '.phrases-item{padding:8px 12px;font-size:12px;color:#333;cursor:pointer;line-height:1.4;word-break:break-word;transition:background .1s;border-bottom:1px solid #f5f5f5}',
    '.phrases-item:hover{background:#f5f7ff;color:#4f7cff}',
    '.phrases-item:last-child{border-bottom:none}',
    '.phrases-empty{padding:20px 12px;text-align:center;font-size:12px;color:#bbb;display:block}',
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
    '      <div class="textarea-wrap">',
    '        <textarea rows="2" placeholder="输入消息..." id="chatInput"></textarea>',
    '        <div class="action-row">',
    '          <div class="phrases-btn-wrap">',
    '            <button class="phrases-btn" id="phrasesBtn">常用语</button>',
    '            <div class="phrases-popup" id="phrasesPopup">',
    '              <div class="phrases-popup-header">',
    '                <span>常用语</span>',
    '                <button class="phrases-settings" id="phrasesSettings" title="管理常用语">⚙</button>',
    '              </div>',
    '              <div class="phrases-list" id="phrasesList"></div>',
    '              <div class="phrases-empty" id="phrasesEmpty">暂无常用语</div>',
    '            </div>',
    '          </div>',
    '          <button class="act-btn enabled" id="btnFetch">发送岗位信息</button>',
    '          <button class="act-btn enabled" id="btnResume">定制简历</button>',
    '          <button class="send" id="sendBtn">↑</button>',
    '        </div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('\n');
  root.appendChild(phone);
  document.body.appendChild(host);
  // 不在此处立即检测可见性——此时 DOM 可能尚未渲染占位文案，
  // hasActiveChat() 可能误判。由下方的 MutationObserver + setInterval 异步处理。

  // ============================================================
  // 4. DOM 引用 & 基础方法
  // ============================================================
  var canvasEl  = root.getElementById('canvas');
  var inputEl   = root.getElementById('chatInput');
  var sendBtn   = root.getElementById('sendBtn');
  var btnFetch  = root.getElementById('btnFetch');
  var btnResume = root.getElementById('btnResume');

  // 常用语
  var phrasesBtn   = root.getElementById('phrasesBtn');
  var phrasesPopup = root.getElementById('phrasesPopup');
  var phrasesList  = root.getElementById('phrasesList');
  var phrasesEmpty = root.getElementById('phrasesEmpty');
  var phrasesSettings = root.getElementById('phrasesSettings');

  var PHRASES_KEY = 'commonPhrases';

  function loadPhrases(cb) {
    chrome.storage.local.get(PHRASES_KEY, function (result) {
      cb(result[PHRASES_KEY] || []);
    });
  }

  function renderPhrasesPopup(phrases) {
    phrasesList.innerHTML = '';
    if (phrases.length === 0) {
      phrasesEmpty.style.display = 'block';
      return;
    }
    phrasesEmpty.style.display = 'none';
    phrases.forEach(function (text) {
      var item = document.createElement('div');
      item.className = 'phrases-item';
      item.textContent = text;
      item.addEventListener('click', function () {
        inputEl.value = text;
        autoResizeTextarea(inputEl);
        inputEl.focus();
        phrasesPopup.classList.remove('open');
      });
      phrasesList.appendChild(item);
    });
  }

  function closePhrasesPopup() {
    phrasesPopup.classList.remove('open');
  }

  function openPhrasesPopup() {
    loadPhrases(function (phrases) {
      renderPhrasesPopup(phrases);
      phrasesPopup.classList.add('open');
    });
  }

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

  // textarea 自适应高度（默认 2 行，最高 9 行）
  function autoResizeTextarea(el) {
    var minH = 56;  // 2 行 ≈ 56px (含 padding)
    var maxH = 196; // 9 行 ≈ 196px
    el.style.height = 'auto';
    var scrollH = el.scrollHeight;
    var target = Math.max(minH, Math.min(scrollH, maxH));
    el.style.height = target + 'px';
    el.style.overflowY = scrollH > maxH ? 'auto' : 'hidden';
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
      var jobInfoMsg = ctx.messages.find(function (m) { return m.role === 'user' && (m.content.startsWith('```') || m.content.startsWith('【岗位基本信息】')); });
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
    autoResizeTextarea(inputEl);
    inputEl.placeholder = placeholder || 'AI 回复中...';
  }

  function enableInput() {
    inputEl.className = '';
    inputEl.disabled = false;
    inputEl.value = '';
    autoResizeTextarea(inputEl);
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
      saveCurrentCtx();

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
          saveCurrentCtx();
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
  // 7. 获取岗位信息（提取 ID → 隐藏标签页 → 详情 → AI）
  // ============================================================

  // 注入 main-world 辅助脚本（通过 web_accessible_resources 绕过 CSP）
  function injectMainWorldHelper() {
    return new Promise(function (resolve, reject) {
      // 防止重复注入；如有缓存数据直接复用
      if (document.querySelector('#boss-ai-mw-helper')) {
        resolve(window.__bossFindResult);
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

  // ============================================================
  // 7. 获取岗位信息（完整流程：提取 ID → 打开隐藏标签页 → 读取详情 → AI 对话）
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
        addSys('⚠️ 未能提取到岗位 ID，无法获取岗位详情', true);
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
            'Base属地：' + (data.city || '未知'),
            '工作时间：' + (data.workSchedule || '未知'),
            '学历要求：' + (data.education || '未知'),
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
            saveCurrentCtx();

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
                saveCurrentCtx();
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
    autoResizeTextarea(inputEl);
    askAI(t);
  }

  sendBtn.addEventListener('click', handleSend);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  inputEl.addEventListener('input', function () { autoResizeTextarea(inputEl); });

  // -------------------- 常用语 --------------------
  phrasesBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (phrasesPopup.classList.contains('open')) {
      closePhrasesPopup();
    } else {
      openPhrasesPopup();
    }
  });

  phrasesSettings.addEventListener('click', function (e) {
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'openPhrasesPage' });
    closePhrasesPopup();
  });

  // Shadow DOM 内点击：不在按钮和弹窗内时关闭
  phone.addEventListener('click', function (e) {
    if (phrasesPopup.classList.contains('open') &&
        !phrasesBtn.contains(e.target) &&
        !phrasesPopup.contains(e.target)) {
      closePhrasesPopup();
    }
  });

  // 页面点击：点击在面板外时关闭（事件从 Shadow DOM 穿出时 target 被重定向为 host）
  document.addEventListener('click', function (e) {
    if (phrasesPopup.classList.contains('open')) {
      var host = document.getElementById('boss-ai-host');
      if (host && !host.contains(e.target)) {
        closePhrasesPopup();
      }
    }
  });

  // ============================================================
  // 9. 启动（先加载持久化上下文，再刷新面板）
  // ============================================================
  var initialChatId = getChatId();
  loadCurrentCtx(initialChatId, function () {
    loadedChatIds[initialChatId] = true;
    lastChatId = initialChatId;
    refreshPanel();
    console.log('[BOSS AI] 面板已注入，chatId=' + lastChatId);
  });
})();
