// ==UserScript==
// @name         BOSS直聘 Token 自动刷新
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  定时刷新 BOSS直聘页面，保持 token 有效，配合 Token 捕获器使用
// @author       you
// @match        https://www.zhipin.com/*
// @icon         https://www.zhipin.com/favicon.ico
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ── 配置 ──
  const CONFIG = {
    // 刷新间隔（毫秒）。默认 15 分钟
    refreshInterval: 15 * 60 * 1000,
    // 只在页面处于后台/非活跃状态时才刷新（true=用户不在操作时刷新）
    refreshOnlyWhenIdle: true,
    // 刷新前 N 秒显示倒计时提示
    notifyBefore: 10,
  };

  // ── 状态 ──
  let countdownTimer = null;
  let refreshTimer = null;
  let secondsLeft = 0;

  // ── 创建 UI 提示 ──
  function createUI() {
    const container = document.createElement('div');
    container.id = 'boss-refresh-timer';
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: rgba(0,0,0,0.75);
      color: #fff;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-family: 'Microsoft YaHei', sans-serif;
      cursor: move;
      user-select: none;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3);
      backdrop-filter: blur(4px);
    `;
    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span id="boss-refresh-label">⏱ 下次刷新</span>
        <span id="boss-refresh-countdown" style="font-weight:bold;font-size:15px">--:--</span>
        <button id="boss-refresh-now" style="
          background:#00a6a7;color:#fff;border:none;
          padding:3px 10px;border-radius:4px;cursor:pointer;
          font-size:12px;margin-left:4px;
        ">立即刷新</button>
      </div>
      <div style="font-size:11px;color:#aaa;margin-top:4px" id="boss-refresh-sub">
        点击"立即刷新"或等待自动刷新
      </div>
    `;

    document.body.appendChild(container);

    // 拖拽支持
    let dragging = false, startX, startY, origX, origY;
    container.addEventListener('mousedown', (e) => {
      if (e.target.id === 'boss-refresh-now') return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origX = container.offsetLeft;
      origY = container.offsetTop;
      container.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      container.style.left = (origX + e.clientX - startX) + 'px';
      container.style.top = (origY + e.clientY - startY) + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
      container.style.cursor = 'move';
    });

    // 立即刷新按钮
    document.getElementById('boss-refresh-now').onclick = doRefresh;
  }

  // ── 更新倒计时 ──
  function updateCountdown(msLeft) {
    const el = document.getElementById('boss-refresh-countdown');
    if (!el) return;
    const totalSec = Math.max(0, Math.floor(msLeft / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    el.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

    // 小于 10 秒变红闪烁
    if (totalSec <= CONFIG.notifyBefore) {
      el.style.color = '#ff6b6b';
      el.style.animation = totalSec <= 5 ? 'boss-blink 0.5s infinite' : 'none';
    } else {
      el.style.color = '#fff';
      el.style.animation = 'none';
    }

    // 更新小提示
    const sub = document.getElementById('boss-refresh-sub');
    if (sub) {
      if (totalSec <= CONFIG.notifyBefore && totalSec > 0) {
        sub.textContent = `${totalSec}秒后将自动刷新页面...`;
      } else if (totalSec <= 0) {
        sub.textContent = '正在刷新...';
      } else {
        sub.textContent = `将在 ${totalSec} 秒后刷新，刷新后可获取最新 token`;
      }
    }
  }

  // ── 执行刷新 ──
  function doRefresh() {
    const sub = document.getElementById('boss-refresh-sub');
    if (sub) sub.textContent = '正在刷新...';
    // 加时间戳避免缓存
    const url = window.location.href.split('?')[0].split('#')[0] +
      '?_t=' + Date.now() + '&_r=' + Math.random().toString(36).slice(2, 6);
    window.location.href = url;
  }

  // ── 重置定时器 ──
  function resetTimer() {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (countdownTimer) clearInterval(countdownTimer);

    // 倒计时更新（每秒）
    let startTime = Date.now();
    countdownTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, CONFIG.refreshInterval - elapsed);
      updateCountdown(remaining);
    }, 200);

    // 刷新定时器
    refreshTimer = setTimeout(() => {
      // 空闲检查
      if (CONFIG.refreshOnlyWhenIdle) {
        const sub = document.getElementById('boss-refresh-sub');
        if (sub) sub.textContent = '页面活跃中，延迟刷新...';
        // 每 5 秒检查一次用户是否空闲
        const idleCheck = setInterval(() => {
          // 如果页面不可见（切换到其他标签页），直接刷新
          if (document.hidden) {
            clearInterval(idleCheck);
            doRefresh();
            return;
          }
        }, 5000);

        // 最多延迟 2 分钟后强制刷新
        setTimeout(() => {
          clearInterval(idleCheck);
          doRefresh();
        }, 120000);
      } else {
        doRefresh();
      }
    }, CONFIG.refreshInterval);
  }

  // ── 添加全局样式 ──
  function addStyle() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes boss-blink {
        50% { opacity: 0.3; }
      }
    `;
    document.head.appendChild(style);
  }

  // ── 启动 ──
  function init() {
    // 只在 BOSS直聘的岗位搜索页工作
    if (!window.location.hostname.includes('zhipin.com')) return;

    addStyle();
    createUI();
    resetTimer();

    // 用户交互时重置倒计时（从最后一次操作开始重新计时）
    let activityTimer;
    const resetOnActivity = () => {
      // 只重置如果设置了空闲刷新
      if (!CONFIG.refreshOnlyWhenIdle) return;
      clearTimeout(activityTimer);
      activityTimer = setTimeout(resetTimer, 5000);
    };

    // 监听用户活动
    document.addEventListener('click', resetOnActivity);
    document.addEventListener('keydown', resetOnActivity);
    document.addEventListener('scroll', resetOnActivity);
    document.addEventListener('mousemove', resetOnActivity);

    console.log('[BOSS刷新] 已启动，每 ' + (CONFIG.refreshInterval / 60000).toFixed(1) + ' 分钟刷新一次');
  }

  // 页面加载完成后启动
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
