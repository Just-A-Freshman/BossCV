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
    '.response-time{font-size:11px;color:#aaa;white-space:nowrap}',
    '.bubble-bottom-bar{display:flex;align-items:center;justify-content:space-between;margin-top:6px;min-height:20px}',
    '.bubble-actions{display:flex;align-items:center;gap:8px}',
    '.bubble-btn{background:none;border:none;color:#bbb;cursor:pointer;padding:2px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;transition:color .15s,background .15s}',
    '.bubble-btn:hover{color:#4f7cff;background:#f0f2f5}',
    '.bubble-btn svg{display:block}',
    '.user-bubble-bar{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}',
    '.row.user .bubble-btn{color:rgba(255,255,255,0.55)}',
    '.row.user .bubble-btn:hover{color:#fff;background:rgba(255,255,255,0.15)}',
    '.row.user.editing{width:100%}',
    '.row.user.editing .bubble{width:100%;box-sizing:border-box;background:#f5f6f8;border:2px solid #4f7cff;border-radius:14px;padding:12px}',
    '.edit-textarea{display:block;width:100%;min-height:180px;border:none;outline:none;background:#f5f6f8;color:#333;font-size:13px;line-height:1.6;font-family:inherit;resize:none;padding:0;margin:0}',
    '.edit-textarea::placeholder{color:#bbb}',
    '.edit-actions{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:10px}',
    '.edit-btn{font-size:13px;font-family:inherit;font-weight:500;cursor:pointer;border-radius:8px;padding:7px 18px;transition:all .15s}',
    '.edit-btn:active{transform:scale(0.97)}',
    '.edit-btn-cancel{background:transparent;color:#666;border:1px solid #d0d0d0}',
    '.edit-btn-cancel:hover{background:#f0f0f0;color:#333}',
    '.edit-btn-send{background:#4f7cff;color:#fff;border:none}',
    '.edit-btn-send:hover{background:#3b66e0}',
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

  function addMsg(role, text, skipActions) {
    var d = document.createElement('div');
    d.className = 'row ' + role;
    d.innerHTML = '<div class="avatar">' + (role === 'ai' ? 'AI' : '我') + '</div><div class="bubble">' + escHtml(text) + '</div>';
    canvasEl.appendChild(d);
    canvasEl.scrollTop = canvasEl.scrollHeight;
    if (role === 'ai' && !skipActions) {
      addBubbleActions(d.querySelector('.bubble'));
    }
    if (role === 'user') {
      addUserBubbleActions(d.querySelector('.bubble'));
    }
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

  // 通过 DOM 中的 .row 位置推算对应的 ctx.messages 索引
  function getMessageIndexFromRow(rowEl) {
    var count = 0;
    var walker = canvasEl.firstElementChild;
    while (walker && walker !== rowEl) {
      if (walker.classList.contains('row')) count++;
      walker = walker.nextElementSibling;
    }
    return count;
  }

  // ============================================================
  // 4a. AI 气泡底部按钮栏（复制 / 重新生成）
  // ============================================================
  var COPY_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.14929 4.02032C7.11197 4.02032 7.87983 4.02016 8.49597 4.07598C9.12128 4.13269 9.65792 4.25188 10.1415 4.53106C10.7202 4.8653 11.2008 5.3459 11.535 5.92462C11.8142 6.40818 11.9334 6.94481 11.9901 7.57012C12.0459 8.18625 12.0458 8.95419 12.0458 9.9168C12.0458 10.8795 12.0459 11.6473 11.9901 12.2635C11.9334 12.8888 11.8142 13.4254 11.535 13.909C11.2008 14.4877 10.7202 14.9683 10.1415 15.3025C9.65792 15.5817 9.12128 15.7009 8.49597 15.7576C7.87984 15.8134 7.11196 15.8133 6.14929 15.8133C5.18667 15.8133 4.41874 15.8134 3.80261 15.7576C3.1773 15.7009 2.64067 15.5817 2.1571 15.3025C1.5784 14.9683 1.09778 14.4877 0.76355 13.909C0.484366 13.4254 0.365184 12.8888 0.308472 12.2635C0.252649 11.6473 0.252808 10.8795 0.252808 9.9168C0.252808 8.95418 0.252664 8.18625 0.308472 7.57012C0.365184 6.94481 0.484366 6.40818 0.76355 5.92462C1.09777 5.34589 1.57839 4.86529 2.1571 4.53106C2.64067 4.25188 3.1773 4.13269 3.80261 4.07598C4.41874 4.02017 5.18666 4.02032 6.14929 4.02032ZM6.14929 5.37774C5.16181 5.37774 4.46634 5.37761 3.92566 5.42657C3.39434 5.47472 3.07859 5.56574 2.83582 5.70587C2.4632 5.92106 2.15354 6.2307 1.93835 6.60333C1.79823 6.8461 1.70721 7.16185 1.65906 7.69317C1.6101 8.23385 1.61023 8.92933 1.61023 9.9168C1.61023 10.9043 1.61009 11.5998 1.65906 12.1404C1.70721 12.6717 1.79823 12.9875 1.93835 13.2303C2.15356 13.6029 2.46321 13.9126 2.83582 14.1277C3.07859 14.2679 3.39434 14.3589 3.92566 14.407C4.46634 14.456 5.16182 14.4559 6.14929 14.4559C7.13682 14.4559 7.83224 14.456 8.37292 14.407C8.90425 14.3589 9.21999 14.2679 9.46277 14.1277C9.83535 13.9126 10.145 13.6029 10.3602 13.2303C10.5004 12.9875 10.5914 12.6717 10.6395 12.1404C10.6885 11.5998 10.6884 10.9043 10.6884 9.9168C10.6884 8.92934 10.6885 8.23384 10.6395 7.69317C10.5914 7.16185 10.5004 6.8461 10.3602 6.60333C10.1451 6.23071 9.83536 5.92107 9.46277 5.70587C9.21999 5.56574 8.90424 5.47472 8.37292 5.42657C7.83224 5.3776 7.13682 5.37774 6.14929 5.37774ZM9.80164 0.367975C10.7638 0.367975 11.5314 0.36788 12.1473 0.423639C12.7726 0.480307 13.3093 0.598759 13.7928 0.877741C14.3717 1.21192 14.8521 1.69355 15.1864 2.27227C15.4655 2.75574 15.5857 3.29164 15.6425 3.9168C15.6983 4.53301 15.6971 5.3016 15.6971 6.26446V7.82989C15.6971 8.29264 15.6989 8.58993 15.6649 8.84844C15.4668 10.3525 14.401 11.5738 12.9833 11.9988V10.5467C13.6973 10.1903 14.2105 9.49662 14.3192 8.67169C14.3387 8.52347 14.3407 8.3358 14.3407 7.82989V6.26446C14.3407 5.27706 14.3398 4.58149 14.2909 4.04083C14.2428 3.50968 14.1526 3.19372 14.0126 2.95098C13.7974 2.57849 13.4876 2.26869 13.1151 2.05352C12.8724 1.91347 12.5564 1.82237 12.0253 1.77423C11.4847 1.72528 10.7888 1.7254 9.80164 1.7254H7.71472C6.7562 1.72558 5.92665 2.27697 5.52332 3.07891H4.07019C4.54221 1.51132 5.9932 0.368186 7.71472 0.367975H9.80164Z" fill="currentColor"></svg>';
  var REGEN_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.92136 0.349152C10.3744 0.349234 12.5564 1.5052 13.9557 3.29894L15.1281 2.12759C15.3303 1.92546 15.6767 2.06943 15.6767 2.35538V5.53923C15.6766 5.71626 15.5329 5.85976 15.3559 5.86002H12.171C11.8854 5.8597 11.7426 5.51465 11.9443 5.31249L12.9641 4.29056C11.8237 2.74305 9.98908 1.74106 7.92136 1.74097C4.46436 1.74097 1.66233 4.543 1.66233 8C1.66233 11.457 4.46436 14.259 7.92136 14.259C11.3782 14.2589 14.1804 11.4569 14.1804 8H15.5722C15.5722 12.2251 12.1465 15.6507 7.92136 15.6508C3.69614 15.6508 0.270508 12.2252 0.270508 8C0.270508 3.77478 3.69614 0.349152 7.92136 0.349152Z" fill="currentColor"></svg>';
  var CHECK_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.3 4.3c.2.2.2.5 0 .7l-7 7c-.2.2-.5.2-.7 0l-3-3c-.2-.2-.2-.5 0-.7.2-.2.5-.2.7 0L6 10.9 12.6 4.3c.2-.2.5-.2.7 0z" fill="currentColor"/></svg>';
  var EDIT_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.94076 1.34942C10.7047 0.90231 11.6503 0.902415 12.4143 1.34942C12.7061 1.52015 12.9688 1.79118 13.3104 2.13284C13.6521 2.47448 13.9231 2.73721 14.0939 3.02894C14.5408 3.79294 14.5409 4.73856 14.0939 5.50251C13.9231 5.79415 13.652 6.05704 13.3104 6.39861L6.65932 13.0497C6.28068 13.4284 6.00695 13.7108 5.66543 13.9097C5.32391 14.1085 4.94315 14.2074 4.42705 14.3498L3.24394 14.6761C2.77527 14.8054 2.34538 14.9262 2.00131 14.9684C1.65196 15.0112 1.17964 15.0013 0.810764 14.6325C0.441921 14.2637 0.432107 13.7913 0.47486 13.442C0.517035 13.0979 0.6379 12.668 0.767181 12.1993L1.09352 11.0162C1.23588 10.5001 1.33481 10.1193 1.5336 9.77784C1.7325 9.43632 2.0149 9.1626 2.39355 8.78395L9.04466 2.13284C9.38625 1.79126 9.64911 1.52016 9.94076 1.34942ZM15.5427 14.8398H7.55223L8.96707 13.425H15.5427V14.8398ZM3.39382 9.78422C2.965 10.213 2.84244 10.3436 2.75709 10.49C2.67183 10.6366 2.61862 10.8079 2.45733 11.3925L2.13099 12.5756C2.00183 13.0439 1.92194 13.3419 1.88863 13.5536C2.10041 13.5204 2.39872 13.4416 2.86764 13.3123L4.05075 12.9859C4.63544 12.8246 4.80669 12.7715 4.95323 12.6862C5.09968 12.6008 5.23022 12.4783 5.65905 12.0494L10.721 6.98644L8.45577 4.72121L3.39382 9.78422ZM11.7 2.57079C11.3774 2.38198 10.9777 2.38198 10.6551 2.57079C10.5602 2.62647 10.4487 2.72931 10.0449 3.13311L9.45604 3.72094L11.7213 5.98617L12.3102 5.39833C12.7139 4.99457 12.8168 4.88307 12.8725 4.78818C13.0613 4.46561 13.0612 4.06585 12.8725 3.74326C12.8169 3.64827 12.7146 3.53752 12.3102 3.13311C11.9057 2.72863 11.795 2.6264 11.7 2.57079Z" fill="currentColor"></svg>';

  // 提取气泡纯文本（跳过操作按钮栏，如复制/编辑等）
  function getBubbleText(bubbleEl, skipClass) {
    var text = '';
    for (var i = 0; i < bubbleEl.childNodes.length; i++) {
      var n = bubbleEl.childNodes[i];
      if (n.classList && n.classList.contains(skipClass)) continue;
      if (n.nodeType === 3) { text += n.textContent; continue; }
      if (n.tagName === 'BR') { text += '\n'; continue; }
      if (n.textContent) text += n.textContent;
    }
    return text.trim();
  }

  function createCopyBtn(bubbleEl, skipClass) {
    var btn = document.createElement('button');
    btn.className = 'bubble-btn';
    btn.title = '复制';
    btn.innerHTML = COPY_SVG;
    btn.addEventListener('click', function () {
      var text = getBubbleText(bubbleEl, skipClass);
      if (!text) return;
      navigator.clipboard.writeText(text).catch(function () {});
      btn.innerHTML = CHECK_SVG;
      btn.title = '已复制';
      setTimeout(function () {
        btn.innerHTML = COPY_SVG;
        btn.title = '复制';
      }, 1500);
    });
    return btn;
  }

  function removeSiblingsAfter(el) {
    while (el.nextElementSibling) el.nextElementSibling.remove();
  }

  function addBubbleActions(bubbleEl, timeMs) {
    var bar = document.createElement('div');
    bar.className = 'bubble-bottom-bar';

    var actions = document.createElement('div');
    actions.className = 'bubble-actions';

    var copyBtn = createCopyBtn(bubbleEl, 'bubble-bottom-bar');
    actions.appendChild(copyBtn);

    var regenBtn = document.createElement('button');
    regenBtn.className = 'bubble-btn';
    regenBtn.title = '重新生成';
    regenBtn.innerHTML = REGEN_SVG;
    regenBtn.addEventListener('click', function () {
      if (streaming) return;
      var rowEl = bubbleEl.closest('.row');
      if (!rowEl) return;
      var ctx = getCurrentCtx();

      var userIdx = getMessageIndexFromRow(rowEl) - 2; // 跳过欢迎语(row 0)和 AI 回复自身
      if (userIdx < 0 || userIdx >= ctx.messages.length || ctx.messages[userIdx].role !== 'user') return;
      var userMsg = ctx.messages[userIdx].content;

      // 从 DOM 删除：上一条用户消息、本 AI 回复及之后所有元素
      var prevRow = rowEl.previousElementSibling;
      while (prevRow && !prevRow.classList.contains('row')) {
        prevRow = prevRow.previousElementSibling;
      }
      removeSiblingsAfter(rowEl);
      if (prevRow && prevRow.parentNode) prevRow.parentNode.removeChild(prevRow);
      if (rowEl.parentNode) rowEl.parentNode.removeChild(rowEl);

      // 截断消息历史：删除用户消息及其后所有内容
      ctx.messages.splice(userIdx);
      saveCurrentCtx();

      // 重新生成（askAI 会重新展示用户消息）
      askAI(userMsg);
    });
    actions.appendChild(regenBtn);

    bar.appendChild(actions);

    if (typeof timeMs === 'number') {
      var sec = (timeMs / 1000).toFixed(1);
      var timeEl = document.createElement('div');
      timeEl.className = 'response-time';
      timeEl.textContent = '⏱ ' + sec + 's';
      bar.appendChild(timeEl);
    }

    bubbleEl.appendChild(bar);
    canvasEl.scrollTop = canvasEl.scrollHeight;
  }

  function addUserBubbleActions(bubbleEl) {
    var bar = document.createElement('div');
    bar.className = 'user-bubble-bar';

    var copyBtn = createCopyBtn(bubbleEl, 'user-bubble-bar');
    bar.appendChild(copyBtn);

    var editBtn = document.createElement('button');
    editBtn.className = 'bubble-btn';
    editBtn.title = '编辑';
    editBtn.innerHTML = EDIT_SVG;
    editBtn.addEventListener('click', function () {
      if (streaming) return;
      var rowEl = bubbleEl.closest('.row');
      var userIdx = getMessageIndexFromRow(rowEl) - 1;
      var ctx = getCurrentCtx();
      var originalText = (ctx.messages[userIdx]?.content || '').replace(/\s*$/, '');

      rowEl.classList.add('editing');
      bubbleEl.innerHTML = '';

      var textarea = document.createElement('textarea');
      textarea.className = 'edit-textarea';
      textarea.value = originalText;
      bubbleEl.appendChild(textarea);

      var actionBar = document.createElement('div');
      actionBar.className = 'edit-actions';

      var cancelBtn = document.createElement('button');
      cancelBtn.className = 'edit-btn edit-btn-cancel';
      cancelBtn.textContent = '取消';

      var sendBtn = document.createElement('button');
      sendBtn.className = 'edit-btn edit-btn-send';
      sendBtn.textContent = '发送';

      actionBar.appendChild(cancelBtn);
      actionBar.appendChild(sendBtn);
      bubbleEl.appendChild(actionBar);

      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);

      cancelBtn.addEventListener('click', function () {
        rowEl.classList.remove('editing');
        bubbleEl.innerHTML = escHtml(originalText);
        addUserBubbleActions(bubbleEl);
        var cr = canvasEl.getBoundingClientRect();
        var rr = rowEl.getBoundingClientRect();
        canvasEl.scrollTop += (rr.bottom - cr.bottom);
      });

      sendBtn.addEventListener('click', function () {
        var newText = textarea.value.trim();
        if (!newText) return;
        var ctx = getCurrentCtx();

        if (userIdx < 0 || userIdx >= ctx.messages.length || ctx.messages[userIdx].role !== 'user') return;

        ctx.messages[userIdx].content = newText;
        rowEl.classList.remove('editing');
        bubbleEl.innerHTML = escHtml(newText);
        addUserBubbleActions(bubbleEl);

        removeSiblingsAfter(rowEl);
        ctx.messages.splice(userIdx + 1);
        saveCurrentCtx();

        askAI(newText, true);
      });
    });
    bar.appendChild(editBtn);

    bubbleEl.appendChild(bar);
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
        addBubbleActions(bubble, timeMs);
        canvasEl.scrollTop = canvasEl.scrollHeight;
      },

      getElement: function () { return row; },
      isDone: function () { return streamingDone; },
    };
  }

  // 按钮状态管理
  function setFetchBtnState(state) {
    if (state === 'done') {
      btnFetch.className = 'act-btn disabled';
      btnFetch.disabled = true;
      btnFetch.innerHTML = '发送岗位信息 <span class="badge">✅</span>';
    } else if (state === 'loading') {
      btnFetch.className = 'act-btn disabled';
      btnFetch.disabled = true;
      btnFetch.innerHTML = '发送岗位信息';
    } else {
      btnFetch.className = 'act-btn enabled';
      btnFetch.disabled = false;
      btnFetch.innerHTML = '发送岗位信息';
    }
  }

  // 添加用户消息（含持久化）
  function addUserMessage(text) {
    addMsg('user', text);
    var ctx = getCurrentCtx();
    ctx.messages.push({ role: 'user', content: text });
    saveCurrentCtx();
  }

  var DEFAULT_PROMPT_BEFORE = '你是一个面试助手，回答简洁专业，使用中文。当前用户还未获取岗位信息，你可以建议用户先获取岗位信息。';
  var DEFAULT_PROMPT_AFTER = '你是一个面试助手，帮助用户分析岗位要求、优化沟通策略。回答简洁专业，使用中文。';

  // ============================================================
  // 5. 刷新面板（对话切换时重建）
  // ============================================================
  function refreshPanel() {
    var ctx = getCurrentCtx();
    clearCanvas();

    addSys('AI 面试助手已就绪');
    addMsg('ai', '你好！点击下方「发送岗位信息」，我可以帮你分析当前岗位的要求，并建议沟通策略。', true);

    if (ctx.jobFetched) {
      var jobInfoMsg = ctx.messages.find(function (m) { return m.role === 'user' && (m.content.startsWith('```') || m.content.startsWith('【岗位基本信息】')); });
      if (jobInfoMsg) addMsg('user', jobInfoMsg.content);
      var aiReply = ctx.messages.find(function (m) { return m.role === 'assistant'; });
      if (aiReply) addMsg('ai', aiReply.content);
      var rest = ctx.messages.slice(2);
      rest.forEach(function (m) { addMsg(m.role === 'assistant' ? 'ai' : 'user', m.content); });

      setFetchBtnState('done');
    } else {
      setFetchBtnState('ready');
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

  function getBasePrompt() {
    if (cachedBasePrompt) return Promise.resolve(cachedBasePrompt);
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'getConfig' }, function (resp) {
        cachedBasePrompt = (resp && resp.ok && resp.config.systemPrompt) || null;
        resolve(cachedBasePrompt);
      });
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

  // ============================================================
  // 统一的流式 AI 请求（消除 P0 重复）
  // ============================================================
  function startStreaming(messages) {
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
        getCurrentCtx().messages.push({ role: 'assistant', content: replyBuffer });
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
  }

  function askAI(userMsg, skipUserDisplay) {
    if (streaming) return;
    var ctx = getCurrentCtx();

    getBasePrompt().then(function (userBasePrompt) {
      var systemMsg = (ctx.jobFetched && ctx.systemPrompt) || userBasePrompt || DEFAULT_PROMPT_BEFORE;
      var messages = [
        { role: 'system', content: systemMsg },
      ].concat(ctx.messages.slice(-20));

      messages.push({ role: 'user', content: userMsg });

      if (!skipUserDisplay) {
        addUserMessage(userMsg);
      }

      startStreaming(messages);
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

  // 等待岗位详情页加载并返回数据（Promise 化，消除 P1 嵌套）
  function waitForJobDetail(jobUrl) {
    return new Promise(function (resolve, reject) {
      var timeoutId;
      var detailListener = function (msg) {
        if (msg.type === 'jobDetailReady') {
          clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(detailListener);
          resolve(msg.data);
        }
      };
      chrome.runtime.onMessage.addListener(detailListener);

      timeoutId = setTimeout(function () {
        chrome.runtime.onMessage.removeListener(detailListener);
        reject(new Error('获取岗位详情超时（20s）'));
      }, 20000);

      chrome.runtime.sendMessage({ type: 'fetchJobDetail', url: jobUrl }, function (resp) {
        if (resp && !resp.ok) {
          clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(detailListener);
          reject(new Error(resp.error || '打开详情页失败'));
        }
      });
    });
  }

  function buildJobInfoString(data) {
    var info = [
      '```',
      '【岗位基本信息】',
      '职位名称：' + (data.title || '未知'),
      '薪资范围：' + (data.salary || '未知'),
      '公司名称：' + (data.company || '未知'),
      'Base属地：' + (data.city || '未知'),
      '工作时间：' + (data.workSchedule || '未知'),
      '学历要求：' + (data.education || '未知'),
      '\n【公司基本信息】',
      '融资阶段：' + (data.stage || '未知'),
      '人员规模：' + (data.scale || '未知'),
      '所属行业：' + (data.industry || '未知'),
      '\n【岗位描述】',
      (data.description || '无'),
      '\n【公司介绍】',
      (data.companyIntro || '无'),
    ].join('\n');

    if (data.bizInfo && data.bizInfo.length > 0) {
      info += '\n\n【工商信息】\n' + data.bizInfo.join('\n') + '\n';
    }
    info += '\n【工作地址】\n' + (data.address || '未知') + '\n';

    var extras = [];
    if (data.skills && data.skills.length > 0) extras.push('技能要求：' + data.skills.join('、'));
    if (data.welfare && data.welfare.length > 0) extras.push('福利待遇：' + data.welfare.join('、'));
    if (extras.length > 0) info += '\n' + extras.join('\n') + '\n';

    info += '```';
    info += '\n了解完这个岗位信息后，只需回复：`我已经对该岗位有了全面理解。等待您的问题！`即可';
    return info;
  }


  function fetchJobInfo() {
    if (streaming) return;
    // 立即置灰，防止重复点击
    setFetchBtnState('loading');

    var ctx = getCurrentCtx();
    addSys('正在注入脚本获取岗位标识...');

    injectMainWorldHelper()
      .then(function (mwData) {
        var ids = extractJobIds(mwData);
        var jobUrl = buildJobUrl(ids);
        if (!jobUrl) throw new Error('未能提取到岗位 ID，无法获取岗位详情');
        addSys('✅ 已获取岗位标识，正在打开详情页...');
        return waitForJobDetail(jobUrl);
      })
      .then(function (data) {
        if (!data || data.error || !data.title) {
          throw new Error(data ? (data.error || '数据为空') : '未知错误');
        }
        var jobInfo = buildJobInfoString(data);
        return getBasePrompt().then(function (basePrompt) {
          basePrompt = basePrompt || DEFAULT_PROMPT_AFTER;
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

          addUserMessage(jobInfo);

          startStreaming([
            { role: 'system', content: ctx.systemPrompt },
            { role: 'user', content: jobInfo },
          ]);

          setFetchBtnState('done');
          addSys('岗位信息已获取，可继续对话');
        });
      })
      .catch(function (err) {
        addSys('⚠️ ' + err.message, true);
        setFetchBtnState('ready');
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
