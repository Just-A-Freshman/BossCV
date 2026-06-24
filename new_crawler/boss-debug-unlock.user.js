// ==UserScript==
// @name         BOSS直聘 事件解锁
// @namespace    https://github.com/Just-A-Freshman
// @version      4.0
// @description  (最小干预) 解锁 F12 / 右键菜单
// @match        https://www.zhipin.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // 只做一件事：在 window capture 阶段拦截 DevTools 快捷键和右键
  // 不覆写任何 prototype，不碰 setTimeout/Function 等底层 API

  window.addEventListener('keydown', function (e) {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C'))
    ) {
      e.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('contextmenu', function (e) {
    e.stopImmediatePropagation();
  }, true);

  // 覆写 outerWidth/outerHeight（只改属性，不动原型）
  try {
    Object.defineProperty(window, 'outerWidth', {
      get: function () { return window.innerWidth; },
      configurable: false,
    });
    Object.defineProperty(window, 'outerHeight', {
      get: function () { return window.innerHeight; },
      configurable: false,
    });
  } catch (_) {}
})();
