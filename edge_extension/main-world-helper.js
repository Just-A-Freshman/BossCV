// main-world-helper.js
// 运行在 BOSS直聘页面的主世界（main world），可以访问 __vue__、Vuex store、_PAGE 等
(function () {
  'use strict';

  var results = {};
  var rawIds = [];
  var componentTree = [];

  // ============================================================
  // 递归搜索对象中的关键字
  // ============================================================
  var SEARCH_KEYS = ['encrypt', 'security', 'jobid', 'lid', 'jobId', 'encryptJobId', 'securityId'];
  var SEEN = new WeakSet();

  function deepSearch(obj, path, depth) {
    if (!obj || depth > 8) return;
    if (typeof obj === 'string') {
      if (obj.length > 8) {
        SEARCH_KEYS.forEach(function (kw) {
          if (path.toLowerCase().includes(kw) || path.toLowerCase().includes(kw.replace('id', ''))) {
            rawIds.push({ source: 'deep:' + path, key: path.split('.').pop(), value: obj });
          }
        });
      }
      return;
    }
    if (typeof obj !== 'object') return;
    if (SEEN.has(obj)) return;
    SEEN.add(obj);

    try {
      var keys = Object.keys(obj);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = obj[k];
        var childPath = path ? path + '.' + k : k;

        // 检查 key 名是否匹配
        var kl = k.toLowerCase();
        var isMatch = SEARCH_KEYS.some(function (kw) { return kl.includes(kw); });
        if (isMatch && typeof v === 'string' && v.length > 8) {
          rawIds.push({ source: 'obj:' + childPath, key: k, value: v });
        }

        // 递归
        if (v && typeof v === 'object' && !(v instanceof Node)) {
          deepSearch(v, childPath, depth + 1);
        }
      }
    } catch (e) {
      // 某些 Vue 响应式属性访问可能抛异常
    }
  }

  // ============================================================
  // 遍历 Vue 组件树并记录结构
  // ============================================================
  function traverseVue(vm, depth, visited) {
    if (!vm || depth > 30) return;
    if (visited.has(vm)) return;
    visited.add(vm);

    var tag = vm.$options && vm.$options._componentTag ? vm.$options._componentTag : (vm.$vnode ? vm.$vnode.tag : '?');
    var name = vm.$options && vm.$options.name ? vm.$options.name : tag;

    if (depth <= 5) {
      componentTree.push({ name: name, tag: tag, depth: depth });
    }

    // 搜索 $data 和 $props
    try {
      var data = vm._data || vm.$data || {};
      deepSearch(data, (name || '?') + '.$data', 0);
    } catch (e) {}
    try {
      deepSearch(vm.$props, (name || '?') + '.$props', 0);
    } catch (e) {}

    // 遍历 $children
    var children = vm.$children || [];
    for (var ci = 0; ci < children.length; ci++) {
      traverseVue(children[ci], depth + 1, visited);
    }
  }

  // ============================================================
  // 查找 Vue 根实例（带重试）
  // ============================================================
  function findVueRoots() {
    var roots = [];
    var selectors = ['#app', '#wrap', '#main', '#container', '.chat-container', '#__nuxt', '#__layout', '#root'];

    selectors.forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) {
        if (el.__vue__) roots.push(el.__vue__);
        if (el.__vue_app__) {
          try { if (el.__vue_app__._instance) roots.push(el.__vue_app__._instance); } catch (e) {}
        }
      }
    });

    // 单次遍历查找 __vue__ 和 __vue_app__（消除重复 DOM 全遍历）
    var all = document.querySelectorAll('*');
    var limit = Math.min(all.length, 3000);
    for (var i = 0; i < limit; i++) {
      try {
        if (all[i].__vue__) roots.push(all[i].__vue__);
      } catch (e) {}
      try {
        if (all[i].__vue_app__ && all[i].__vue_app__._instance) roots.push(all[i].__vue_app__._instance);
      } catch (e) {}
    }

    return roots;
  }

  // ============================================================
  // 尝试访问 Vuex store
  // ============================================================
  function findVuexState() {
    var stores = [];
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length && i < 1000; i++) {
      try {
        if (all[i].__vue__ && all[i].__vue__.$store) {
          var state = all[i].__vue__.$store.state;
          if (state) stores.push(state);
        }
      } catch (e) {}
      try {
        if (all[i].__vue_app__ && all[i].__vue_app__.config) {
          // Vue 3: try to get store from app
        }
      } catch (e) {}
    }
    return stores;
  }

  // ============================================================
  // 在特定 DOM 元素上找 __vue__
  // ============================================================
  function searchTargetElements() {
    var selectors = [
      '[ka="geek_chat_job_detail"]', '.position-main', '.chat-position-content',
      '.top-info-content', '.dialog-header', '.chat-im', '.chat-editor',
      '.message-controls', '.editor-container', '.position-content', '.right-content',
    ];
    selectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        try {
          if (el.__vue__) {
            deepSearch(el.__vue__._data || el.__vue__.$data, sel + '.$data', 0);
            deepSearch(el.__vue__.$props, sel + '.$props', 0);
          }
        } catch (e) {}
        // 再试 __vue_app__
        try {
          if (el.__vue_app__ && el.__vue_app__._instance) {
            deepSearch(el.__vue_app__._instance._data || {}, sel + '.[vue3]$data', 0);
          }
        } catch (e) {}
      });
    });
  }

  // ============================================================
  // 从 DOM 属性和事件中提取信息
  // ============================================================
  function searchDOMEvents() {
    // 找所有 span/a/button 上的 onclick 属性和 data-* 属性
    var candidates = document.querySelectorAll('[onclick], [data-id], [data-job], [data-encrypt]');
    candidates.forEach(function (el) {
      for (var i = 0; i < el.attributes.length; i++) {
        var attr = el.attributes[i];
        if (attr.name.startsWith('data-') || attr.name === 'onclick') {
          var val = attr.value;
          if (val && val.length > 5 && (val.includes('job') || val.includes('encrypt') || val.includes('security'))) {
            rawIds.push({ source: 'DOM attr: ' + attr.name, key: attr.name, value: val.slice(0, 300) });
          }
        }
      }
    });
  }

  // ============================================================
  // 轮询执行（应对 Vue 异步渲染）
  // ============================================================
  var MAX_ATTEMPTS = 15;
  var attempt = 0;

  function execute() {
    attempt++;
    if (attempt > MAX_ATTEMPTS) {
      sendResult();
      return;
    }

    // _PAGE
    if (typeof _PAGE !== 'undefined' && attempt === 1) {
      results['_PAGE'] = JSON.stringify(_PAGE).slice(0, 1000);
    }

    // Vue roots
    var roots = findVueRoots();
    if (attempt === 1) results['VueRootsFound'] = roots.length;

    // Traverse each root
    var visited = new WeakSet();
    var beforeCount = rawIds.length;
    roots.forEach(function (root) {
      traverseVue(root, 0, visited);
    });

    // Search target elements
    searchTargetElements();

    // Search DOM events
    searchDOMEvents();

    // Vuex
    if (attempt === 1) {
      try {
        var stores = findVuexState();
        stores.forEach(function (state, idx) {
          deepSearch(state, 'Vuex[' + idx + ']', 0);
        });
      } catch (e) {}
    }

    var newIds = rawIds.length - beforeCount;

    // 如果还没找到，继续轮询
    if (newIds === 0 && attempt < MAX_ATTEMPTS) {
      setTimeout(execute, 1000);
    } else {
      sendResult();
    }
  }

  function sendResult() {
    var detail = {
      results: results,
      rawIds: rawIds,
      componentTree: componentTree.slice(0, 100),
      attempts: attempt,
      url: location.href,
    };
    document.dispatchEvent(new CustomEvent('__bossFindResult', { detail: detail }));
  }

  // 3 秒延迟后开始（等 Vue 渲染稳定）
  setTimeout(execute, 3000);
})();
