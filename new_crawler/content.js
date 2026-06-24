(function () {
  'use strict';

  if (!location.hostname.includes('zhipin.com') || !location.pathname.includes('/chat')) return;

  // ============================================================
  // 1. 挤压页面 — 改 #wrap 右边距 + 强制 chat-wrap 自适应
  // ============================================================
  (function squeezePage() {
    // 防滚动 + 基础布局
    var s = document.createElement('style');
    s.id = 'boss-ai-squeeze';
    s.textContent = 'html,body{overflow-x:hidden!important}';
    document.head.appendChild(s);

    // 高强度强制执行
    setInterval(function () {
      var wrap = document.querySelector('#wrap');
      if (!wrap) return;

      // 面板右侧占 400+10 = 410px，挤压量自适应
      var squeeze = Math.max(200, window.innerWidth - 1020);
      squeeze = Math.min(squeeze, 620);

      // #wrap 缩小宽度 + 贴左
      wrap.style.setProperty('width', 'calc(100vw - ' + squeeze + 'px)', 'important');
      wrap.style.setProperty('margin-left', '0', 'important');
      wrap.style.setProperty('margin-right', 'auto', 'important');
      wrap.style.setProperty('max-width', 'none', 'important');
      wrap.style.setProperty('min-width', '0', 'important');

      // 级联缩小内部容器
      var chain = '.main-wrap,#main.inner,#container,.chat-container,.chat-wrap'.split(',');
      chain.forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) el.style.setProperty('max-width', '100%', 'important');
      });
    }, 200);
  })();

  // ============================================================
  // 2. 构建手机风格 AI 面板
  // ============================================================
  var PANEL_W = 400;
  var TOP = 56;

  var host = document.createElement('div');
  host.id = 'boss-ai-host';
  var root = host.attachShadow({ mode: 'closed' });

  // --- 样式（使用 <style> 代替 adoptedStyleSheets，Shadow DOM 兼容性更好）---
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
    '.bubble{padding:10px 14px;font-size:13px;line-height:1.55;font-family:-apple-system,"Microsoft YaHei","PingFang SC",sans-serif;word-break:break-word}',
    '.row.ai .bubble{background:#f0f2f5;color:#333;border-radius:14px 14px 14px 4px}',
    '.row.user .bubble{background:#4f7cff;color:#fff;border-radius:14px 14px 4px 14px}',
    '.sys-msg{align-self:center;font-size:12px;color:#999;padding:6px 0;font-family:-apple-system,"Microsoft YaHei",sans-serif}',
    '.sys-msg.error{color:#ff4d4f}',
    '.bottom{background:#fff;border-top:1px solid #eee;padding:10px 12px}',
    '.input-row{display:flex;align-items:center;gap:8px}',
    '.input-row input{flex:1;height:36px;border:1px solid #e0e0e0;border-radius:18px;padding:0 14px;font-size:13px;font-family:-apple-system,"Microsoft YaHei",sans-serif;outline:none;background:#f8f9fa;transition:border-color .2s;box-sizing:border-box}',
    '.input-row input:focus{border-color:#4f7cff;background:#fff}',
    '.input-row input::placeholder{color:#bbb}',
    '.input-row .send{width:36px;height:36px;border-radius:50%;border:none;background:#4f7cff;color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;flex-shrink:0}',
    '.input-row .send:active{transform:scale(0.92)}',
    '.input-row .send:hover{background:#3b66e0}',
    '.actions{display:flex;justify-content:center;gap:24px;margin-top:10px}',
    '.act-btn{background:none;border:none;font-size:13px;cursor:pointer;padding:4px 6px;font-family:-apple-system,"Microsoft YaHei",sans-serif;transition:color .15s}',
    '.act-btn.enabled{color:#4f7cff}',
    '.act-btn.enabled:hover{color:#3b66e0}',
    '.act-btn.disabled{color:#c0c4cc;cursor:not-allowed}',
    '.act-btn .badge{font-size:11px;margin-left:2px}',
    '@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
    '.row,.sys-msg{animation:fadeIn .25s ease}',
  ].join('');
  root.appendChild(style);

  // --- HTML ---
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

  // --- 外部开关按钮（始终可见）---
  var toggle = document.createElement('div');
  toggle.id = 'boss-ai-toggle';
  toggle.textContent = '◀';
  toggle.style.cssText = [
    'position:fixed',
    'top:' + (TOP + 20) + 'px',
    'right:10px',
    'width:32px',
    'height:60px',
    'background:#e8eaed',
    'border-radius:8px 0 0 8px',
    'color:#666',
    'font-size:14px',
    'cursor:pointer',
    'z-index:999999',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'transition:right 0.3s,opacity 0.3s',
    'user-select:none',
    'border:none',
    'font-family:sans-serif',
  ].join(';');
  document.body.appendChild(toggle);

  // ============================================================
  // 3. DOM 引用 & 事件
  // ============================================================
  var canvasEl = root.getElementById('canvas');
  var inputEl = root.getElementById('chatInput');
  var sendBtn = root.getElementById('sendBtn');
  var btnFetch = root.getElementById('btnFetch');
  var btnResume = root.getElementById('btnResume');

  function addMsg(role, text) {
    var d = document.createElement('div');
    d.className = 'row ' + role;
    d.innerHTML = '<div class="avatar">' + (role === 'ai' ? 'AI' : '我') + '</div><div class="bubble">' + text + '</div>';
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

  // --- 面板展开/收起 ---
  var visible = true;
  toggle.onclick = function () {
    visible = !visible;
    phone.style.display = visible ? '' : 'none';
    toggle.textContent = visible ? '◀' : '▶';
    toggle.style.right = visible ? '10px' : '10px';
  };

  // --- 发送岗位信息 ---
  btnFetch.addEventListener('click', function () {
    if (this.disabled) return;
    btnFetch.className = 'act-btn disabled';
    btnFetch.disabled = true;
    btnFetch.innerHTML = '发送岗位信息 <span class="badge">⏳</span>';

    setTimeout(function () {
      var info = '【岗位信息简报】\n公司: XX科技有限公司\n岗位: 高级前端开发工程师\n薪资: 25K-50K·15薪\n要求: 5年以上React经验，熟悉TypeScript\n福利: 六险一金·弹性工作·股票期权';
      addMsg('user', info);
      setTimeout(function () {
        addMsg('ai', '已收到岗位信息！这个岗位的核心要求：\n1️⃣ React 深度经验\n2️⃣ TypeScript 能力\n3️⃣ 大型项目经验\n\n建议重点展示相关项目经历。需要我帮你梳理回复思路吗？');
        btnFetch.className = 'act-btn disabled';
        btnFetch.innerHTML = '发送岗位信息 <span class="badge">✅</span>';
        addSys('岗位信息已获取，可继续对话');
      }, 600);
    }, 1500);
  });

  btnResume.addEventListener('click', function () {});

  function handleSend() {
    var t = inputEl.value.trim();
    if (!t) return;
    addMsg('user', t);
    inputEl.value = '';
    setTimeout(function () { addMsg('ai', '收到。请问还需要了解什么？'); }, 500);
  }
  sendBtn.addEventListener('click', handleSend);
  inputEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleSend(); });

  console.log('[BOSS AI] 面板已注入');
})();
