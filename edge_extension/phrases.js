(function () {
  'use strict';

  var PHRASES_KEY = 'commonPhrases';
  var listEl   = document.getElementById('list');
  var emptyEl  = document.getElementById('empty');
  var inputEl  = document.getElementById('input');
  var addBtn   = document.getElementById('addBtn');
  var toastEl  = document.getElementById('toast');

  // 弹窗
  var overlayEl   = document.getElementById('overlay');
  var modalInput  = document.getElementById('modalInput');
  var charCount   = document.getElementById('charCount');
  var modalClose  = document.getElementById('modalClose');
  var modalCancel = document.getElementById('modalCancel');
  var modalSave   = document.getElementById('modalSave');
  var editIndex = -1; // 当前修改的条目索引

  var toastTimer = null;

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 2000);
  }

  function loadPhrases(cb) {
    chrome.storage.local.get(PHRASES_KEY, function (result) {
      cb(result[PHRASES_KEY] || []);
    });
  }

  function savePhrases(phrases, cb) {
    chrome.storage.local.set({ [PHRASES_KEY]: phrases }, cb);
  }

  function renderList(phrases) {
    listEl.innerHTML = '';
    if (phrases.length === 0) {
      emptyEl.style.display = 'block';
      return;
    }
    emptyEl.style.display = 'none';
    phrases.forEach(function (text, index) {
      var item = document.createElement('div');
      item.className = 'item';

      var textSpan = document.createElement('span');
      textSpan.className = 'item-text';
      textSpan.textContent = text;

      var editBtn = document.createElement('button');
      editBtn.className = 'item-act';
      editBtn.textContent = '✎';
      editBtn.title = '修改';
      editBtn.addEventListener('click', function () {
        openEditModal(text, index);
      });

      var delBtn = document.createElement('button');
      delBtn.className = 'item-act item-del';
      delBtn.textContent = '✖';
      delBtn.title = '删除';
      delBtn.addEventListener('click', function () {
        phrases.splice(index, 1);
        savePhrases(phrases, function () {
          renderList(phrases);
          showToast('已删除');
        });
      });

      item.appendChild(textSpan);
      item.appendChild(editBtn);
      item.appendChild(delBtn);
      listEl.appendChild(item);
    });
  }

  function addPhrase() {
    var text = inputEl.value.trim();
    if (!text) return;
    loadPhrases(function (phrases) {
      phrases.push(text);
      savePhrases(phrases, function () {
        renderList(phrases);
        inputEl.value = '';
        inputEl.focus();
        showToast('已添加');
      });
    });
  }

  // ---- 事件绑定 ----
  addBtn.addEventListener('click', addPhrase);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPhrase();
    }
  });

  // ---- 修改弹窗 ----
  function openEditModal(text, index) {
    editIndex = index;
    modalInput.value = text;
    updateCharCount();
    overlayEl.classList.add('open');
    modalInput.focus();
  }

  function closeEditModal() {
    overlayEl.classList.remove('open');
    editIndex = -1;
  }

  function updateCharCount() {
    var len = modalInput.value.length;
    charCount.textContent = len + '/200';
  }

  function saveEdit() {
    var text = modalInput.value.trim();
    if (!text || editIndex < 0) return;
    loadPhrases(function (phrases) {
      phrases[editIndex] = text;
      savePhrases(phrases, function () {
        renderList(phrases);
        closeEditModal();
        showToast('已修改');
      });
    });
  }

  modalClose.addEventListener('click', closeEditModal);
  modalCancel.addEventListener('click', closeEditModal);
  modalSave.addEventListener('click', saveEdit);
  modalInput.addEventListener('input', updateCharCount);
  overlayEl.addEventListener('click', function (e) {
    if (e.target === overlayEl) closeEditModal();
  });
  modalInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
  });

  // ---- 启动 ----
  loadPhrases(function (phrases) {
    renderList(phrases);
  });
})();
