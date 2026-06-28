(function () {
  'use strict';

  var RESUME_KEY = 'userResume';

  // ===== Toast =====
  var toastEl = document.getElementById('toast');
  var toastTimer;

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2000);
  }

  // ===== 目录构建 =====
  function buildTOC() {
    var toc = document.getElementById('toc');
    document.querySelectorAll('.section-anchor').forEach(function (sec) {
      var title = sec.querySelector('.card-title');
      if (!title) return;
      var link = document.createElement('a');
      link.className = 'sidebar-link';
      link.textContent = title.textContent;
      link.href = '#' + sec.id;
      toc.appendChild(link);
    });
  }

  // ===== 字段绑定 =====
  function setField(path, value) {
    var el = document.querySelector('[data-path="' + path + '"]');
    if (!el) return;
    el.value = value || '';
  }

  function getField(path) {
    var el = document.querySelector('[data-path="' + path + '"]');
    return el ? el.value : '';
  }

  // ===== 静态字段路径列表 =====
  var FIELD_PATHS = [
    'basic.name', 'basic.birthDate', 'basic.gender', 'basic.workYears',
    'basic.jobIntention', 'basic.phone', 'basic.email', 'basic.politicalStatus', 'basic.custom',
    'honors', 'selfEvaluation',
  ];

  function populateStaticFields(data) {
    FIELD_PATHS.forEach(function (path) {
      var parts = path.split('.');
      var val = data;
      for (var i = 0; i < parts.length && val; i++) val = val[parts[i]];
      setField(path, val || '');
    });
  }

  function collectStaticFields() {
    var result = {};
    FIELD_PATHS.forEach(function (path) {
      var parts = path.split('.');
      var val = getField(path);
      if (parts.length === 1) {
        result[parts[0]] = val;
      } else {
        if (!result[parts[0]]) result[parts[0]] = {};
        result[parts[0]][parts[1]] = val;
      }
    });
    return result;
  }

  // ===== 专业技能（名称 + 描述） =====
  var skillsList = document.getElementById('skillsList');

  function createSkillItem(data) {
    var div = document.createElement('div');
    div.className = 'extra-entry';

    var header = document.createElement('div');
    header.className = 'extra-header';

    var label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = '技能名称';
    header.appendChild(label);

    var title = document.createElement('input');
    title.className = 'extra-title';
    title.placeholder = '输入技能名称...';
    title.value = (data && data.name) || '';
    header.appendChild(title);

    var delBtn = document.createElement('button');
    delBtn.className = 'dyn-del';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', function () { div.remove(); });
    header.appendChild(delBtn);

    div.appendChild(header);

    var ta = document.createElement('textarea');
    ta.className = 'field-textarea';
    ta.placeholder = '描述该项技能...';
    // 兼容旧数据：旧格式是纯字符串，新格式是 {name, content}
    ta.value = (data && data.content) || (typeof data === 'string' ? data : '');
    div.appendChild(ta);

    return div;
  }

  function renderSkills(items) {
    skillsList.innerHTML = '';
    if (!items || items.length === 0) {
      skillsList.appendChild(createSkillItem(null));
      return;
    }
    items.forEach(function (item) { skillsList.appendChild(createSkillItem(item)); });
  }

  function collectSkills() {
    var items = [];
    skillsList.querySelectorAll('.extra-entry').forEach(function (entry) {
      var name = entry.querySelector('.extra-title').value.trim();
      var content = entry.querySelector('.field-textarea').value.trim();
      if (name || content) items.push({ name: name, content: content });
    });
    return items;
  }

  document.getElementById('skillsAdd').addEventListener('click', function () {
    skillsList.appendChild(createSkillItem(''));
  });

  // ===== 自定义模块（名称 + 内容） =====
  var extraList = document.getElementById('extraList');

  function createExtraEntry(data) {
    var div = document.createElement('div');
    div.className = 'extra-entry';

    var header = document.createElement('div');
    header.className = 'extra-header';

    var label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = '模块名称';
    header.appendChild(label);

    var title = document.createElement('input');
    title.className = 'extra-title';
    title.placeholder = '输入模块名称...';
    title.value = (data && data.name) || '';
    header.appendChild(title);

    var delBtn = document.createElement('button');
    delBtn.className = 'dyn-del';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', function () { div.remove(); });
    header.appendChild(delBtn);

    div.appendChild(header);

    var ta = document.createElement('textarea');
    ta.className = 'field-textarea';
    ta.placeholder = '输入内容...';
    ta.value = (data && data.content) || '';
    div.appendChild(ta);

    return div;
  }

  function renderExtraModules(items) {
    extraList.innerHTML = '';
    (items || []).forEach(function (d) { extraList.appendChild(createExtraEntry(d)); });
  }

  function collectExtraModules() {
    var items = [];
    extraList.querySelectorAll('.extra-entry').forEach(function (entry) {
      var name = entry.querySelector('.extra-title').value.trim();
      var content = entry.querySelector('.field-textarea').value.trim();
      if (name || content) items.push({ name: name, content: content });
    });
    return items;
  }

  document.getElementById('extraAdd').addEventListener('click', function () {
    extraList.appendChild(createExtraEntry(null));
  });

  // ===== 复合条目（工作/实习/项目） =====
  var ENTRY_CONFIG = {
    education: {
      container: document.getElementById('educationList'),
      addBtn: document.getElementById('educationAdd'),
      rowClass: 'field-row-4',
      fields: [
        { key: 'school', label: '学校名称' },
        { key: 'major',  label: '专业' },
        { key: 'degree', label: '学历', placeholder: '本科/硕士/博士' },
        { key: 'period', label: '在校时间', placeholder: '2016.09 - 2020.06' },
      ],
      contentField: { key: 'courses', label: '相关信息' },
    },
    work: {
      container: document.getElementById('workList'),
      addBtn: document.getElementById('workAdd'),
      fields: [
        { key: 'company',  label: '公司名称' },
        { key: 'position', label: '职位' },
        { key: 'period',   label: '工作时间', placeholder: '2020.07 - 2022.08' },
      ],
      contentField: { key: 'content', label: '工作内容' },
      supportsVersions: true,
    },
    internship: {
      container: document.getElementById('internshipList'),
      addBtn: document.getElementById('internshipAdd'),
      fields: [
        { key: 'company',  label: '公司名称' },
        { key: 'position', label: '职位名称' },
        { key: 'period',   label: '实习时间', placeholder: '2023.06 - 2023.12' },
      ],
      contentField: { key: 'content', label: '实际内容' },
      supportsVersions: true,
    },
    project: {
      container: document.getElementById('projectsList'),
      addBtn: document.getElementById('projectsAdd'),
      fields: [
        { key: 'name',   label: '项目名称' },
        { key: 'role',   label: '项目角色' },
        { key: 'period', label: '项目时间', placeholder: '2023.01 - 2023.06' },
      ],
      contentField: { key: 'description', label: '项目描述' },
      supportsVersions: true,
    },
  };

  function createEntryCard(cfg, data) {
    var card = document.createElement('div');
    card.className = 'entry-card';

    var delBtn = document.createElement('button');
    delBtn.className = 'dyn-del';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', function () { card.remove(); });
    card.appendChild(delBtn);

    var row = document.createElement('div');
    row.className = 'field-row ' + (cfg.rowClass || 'field-row-3');
    cfg.fields.forEach(function (f) {
      var g = document.createElement('div');
      g.className = 'field-group';

      var label = document.createElement('label');
      label.className = 'field-label';
      label.textContent = f.label;
      g.appendChild(label);

      var input = document.createElement('input');
      input.className = 'field-input';
      input.dataset.key = f.key;
      input.value = (data && data[f.key]) || '';
      input.placeholder = f.placeholder || '';
      g.appendChild(input);

      row.appendChild(g);
    });
    card.appendChild(row);

    if (cfg.contentField) {
      if (cfg.supportsVersions) {
        card.appendChild(createVersionManager(cfg, data));
      } else {
        var cf = cfg.contentField;
        var cr = document.createElement('div');
        cr.className = 'field-row';

        var cg = document.createElement('div');
        cg.className = 'field-group full';

        var cl = document.createElement('label');
        cl.className = 'field-label';
        cl.textContent = cf.label;
        cg.appendChild(cl);

        var ta = document.createElement('textarea');
        ta.className = 'field-textarea';
        ta.dataset.key = cf.key;
        ta.value = (data && data[cf.key]) || '';
        cg.appendChild(ta);

        cr.appendChild(cg);
        card.appendChild(cr);
      }
    }

    return card;
  }

  // ===== 多版本管理器 =====
  function createVersionManager(cfg, data) {
    var cf = cfg.contentField;

    // 向后兼容：旧数据只有 content 没有 versions
    var versions = (data && data.versions) || [];
    if (versions.length === 0 && data && data[cf.key]) {
      versions = [{ label: '默认版本', content: data[cf.key] }];
    }
    if (versions.length === 0) {
      versions = [{ label: '默认版本', content: '' }];
    }

    var currentIdx = 0;

    var container = document.createElement('div');
    container.className = 'version-manager';

    var tabBar = document.createElement('div');
    tabBar.className = 'version-tab-bar';

    var itemsContainer = document.createElement('div');
    itemsContainer.className = 'version-items';

    function render() {
      tabBar.innerHTML = '';
      itemsContainer.innerHTML = '';

      versions.forEach(function (v, i) {
        // ---- Tab pill ----
        var pill = document.createElement('span');
        pill.className = 'version-pill' + (i === currentIdx ? ' active' : '');

        var labelSpan = document.createElement('span');
        labelSpan.className = 'vp-label';
        labelSpan.textContent = v.label || ('版本 ' + (i + 1));
        labelSpan.contentEditable = true;
        labelSpan.addEventListener('blur', function () {
          v.label = labelSpan.textContent.trim() || ('版本 ' + (i + 1));
        });
        labelSpan.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); labelSpan.blur(); }
        });
        pill.appendChild(labelSpan);

        if (versions.length > 1) {
          var del = document.createElement('span');
          del.className = 'vp-del';
          del.textContent = '×';
          del.addEventListener('click', function (e) {
            e.stopPropagation();
            versions.splice(i, 1);
            if (currentIdx >= versions.length) currentIdx = versions.length - 1;
            render();
          });
          pill.appendChild(del);
        }

        pill.addEventListener('click', function () {
          if (i === currentIdx) return;
          currentIdx = i;
          render();
        });

        tabBar.appendChild(pill);

        // ---- Version item (content area) ----
        var item = document.createElement('div');
        item.className = 'version-item' + (i !== currentIdx ? ' hidden' : '');

        var labelRow = document.createElement('div');
        labelRow.className = 'field-row';
        var labelG = document.createElement('div');
        labelG.className = 'field-group';
        var labelL = document.createElement('label');
        labelL.className = 'field-label';
        labelL.textContent = '版本标签';
        labelG.appendChild(labelL);
        var labelI = document.createElement('input');
        labelI.className = 'field-input version-label';
        labelI.value = v.label || '';
        labelI.placeholder = '如：架构方向、管理方向';
        labelI.addEventListener('input', function () {
          v.label = labelI.value;
          var tabLabels = tabBar.querySelectorAll('.vp-label');
          if (tabLabels[i]) tabLabels[i].textContent = v.label || ('版本 ' + (i + 1));
        });
        labelG.appendChild(labelI);
        labelRow.appendChild(labelG);
        item.appendChild(labelRow);

        var contentRow = document.createElement('div');
        contentRow.className = 'field-row';
        var contentG = document.createElement('div');
        contentG.className = 'field-group full';
        var contentL = document.createElement('label');
        contentL.className = 'field-label';
        contentL.textContent = cf.label;
        contentG.appendChild(contentL);
        var contentTA = document.createElement('textarea');
        contentTA.className = 'field-textarea version-content';
        contentTA.value = v.content || '';
        contentTA.placeholder = '描述此版本内容...';
        contentTA.addEventListener('input', function () {
          v.content = contentTA.value;
        });
        contentG.appendChild(contentTA);
        contentRow.appendChild(contentG);
        item.appendChild(contentRow);

        itemsContainer.appendChild(item);
      });

      // ---- Add version button ----
      var addBtn = document.createElement('button');
      addBtn.className = 'version-add';
      addBtn.textContent = '+ 添加版本';
      addBtn.addEventListener('click', function () {
        versions.push({ label: '', content: '' });
        currentIdx = versions.length - 1;
        render();
      });
      tabBar.appendChild(addBtn);
    }

    render();
    container.appendChild(tabBar);
    container.appendChild(itemsContainer);
    return container;
  }

  function renderEntries(cfg, items) {
    cfg.container.innerHTML = '';
    (items || []).forEach(function (d) { cfg.container.appendChild(createEntryCard(cfg, d)); });
  }

  function collectEntries(cfg) {
    var items = [];
    cfg.container.querySelectorAll('.entry-card').forEach(function (card) {
      var entry = {};
      card.querySelectorAll('[data-key]').forEach(function (el) {
        entry[el.dataset.key] = el.value.trim();
      });

      // 收集多版本数据
      if (cfg.supportsVersions) {
        var versionItems = card.querySelectorAll('.version-item');
        var versions = [];
        versionItems.forEach(function (item) {
          var label = item.querySelector('.version-label').value.trim();
          var content = item.querySelector('.version-content').value.trim();
          if (label || content) versions.push({ label: label, content: content });
        });
        if (versions.length > 0) {
          entry.versions = versions;
          // 首版本内容兼容旧字段
          entry[cfg.contentField.key] = versions[0].content;
        }
      }

      if (entry[cfg.fields[0].key]) items.push(entry);
    });
    return items;
  }

  Object.keys(ENTRY_CONFIG).forEach(function (key) {
    var cfg = ENTRY_CONFIG[key];
    cfg.addBtn.addEventListener('click', function () {
      cfg.container.appendChild(createEntryCard(cfg, null));
    });
  });

  // ===== 加载 / 保存 =====
  function loadResume() {
    chrome.storage.local.get(RESUME_KEY, function (result) {
      var data = result[RESUME_KEY] || {};
      populateStaticFields(data);
      renderSkills(data.skills);

      // 教育经历兼容：旧格式是对象（单条），新格式是数组（多条）
      var edu = data.education;
      if (edu && !Array.isArray(edu)) edu = [edu];
      renderEntries(ENTRY_CONFIG.education, edu);

      renderEntries(ENTRY_CONFIG.work, data.workExperience);
      renderEntries(ENTRY_CONFIG.internship, data.internship);
      renderEntries(ENTRY_CONFIG.project, data.projects);
      renderExtraModules(data.extraModules);
    });
  }

  function saveResume(silent) {
    var data = collectStaticFields();
    data.skills = collectSkills();
    data.education = collectEntries(ENTRY_CONFIG.education);
    data.workExperience = collectEntries(ENTRY_CONFIG.work);
    data.internship = collectEntries(ENTRY_CONFIG.internship);
    data.projects = collectEntries(ENTRY_CONFIG.project);
    data.extraModules = collectExtraModules();

    chrome.storage.local.set({ userResume: data }, function () {
      if (chrome.runtime.lastError) {
        showToast('保存失败: ' + chrome.runtime.lastError.message);
        return;
      }
      if (!silent) showToast('简历已保存');
    });
  }

  // ===== 导出简历内容 =====
  function formatResumeData(data) {
    var lines = [];

    lines.push('【基础信息】');
    if (data.basic) {
      addLine(lines, '姓名', data.basic.name);
      addLine(lines, '性别', data.basic.gender);
      addLine(lines, '出生日期', data.basic.birthDate);
      addLine(lines, '工作年限', data.basic.workYears);
      addLine(lines, '求职意向', data.basic.jobIntention);
      addLine(lines, '电话', data.basic.phone);
      addLine(lines, '邮箱', data.basic.email);
      addLine(lines, '政治面貌', data.basic.politicalStatus);
    }

    if (data.education && data.education.length > 0) {
      lines.push('\n【教育背景】');
      data.education.forEach(function (e) {
        var header = e.school || '教育经历';
        if (e.major) header += '（' + e.major + '）';
        lines.push('--- ' + header + ' ---');
        addLine(lines, '学校名称', e.school);
        addLine(lines, '专业', e.major);
        addLine(lines, '学历', e.degree);
        addLine(lines, '在校时间', e.period);
        addLine(lines, '相关信息', e.courses);
      });
    }

    if (data.skills && data.skills.length > 0) {
      lines.push('\n【专业技能】');
      data.skills.forEach(function (s) {
        if (typeof s === 'string') {
          lines.push(s);
        } else {
          var header = s.name || '技能';
          lines.push('--- ' + header + ' ---');
          if (s.content) lines.push(stripHtml(s.content));
        }
      });
    }

    if (data.workExperience && data.workExperience.length > 0) {
      lines.push('\n【工作经历】');
      data.workExperience.forEach(function (w) {
        var header = w.company;
        if (w.position) header += '（' + w.position + '）';
        lines.push('--- ' + header + ' ---');
        addLine(lines, '工作时间', w.period);
        if (w.versions && w.versions.length > 0) {
          w.versions.forEach(function (v) {
            if (v.label) lines.push('[' + v.label + ']');
            if (v.content) lines.push(stripHtml(v.content));
          });
        } else if (w.content) {
          addLine(lines, '工作内容', w.content);
        }
      });
    }

    if (data.internship && data.internship.length > 0) {
      lines.push('\n【实习经历】');
      data.internship.forEach(function (w) {
        var header = w.company;
        if (w.position) header += '（' + w.position + '）';
        lines.push('--- ' + header + ' ---');
        addLine(lines, '实习时间', w.period);
        if (w.versions && w.versions.length > 0) {
          w.versions.forEach(function (v) {
            if (v.label) lines.push('[' + v.label + ']');
            if (v.content) lines.push(stripHtml(v.content));
          });
        } else if (w.content) {
          addLine(lines, '实际内容', w.content);
        }
      });
    }

    if (data.projects && data.projects.length > 0) {
      lines.push('\n【项目经历】');
      data.projects.forEach(function (p) {
        var header = p.name;
        if (p.role) header += '（' + p.role + '）';
        lines.push('--- ' + header + ' ---');
        addLine(lines, '项目时间', p.period);
        if (p.versions && p.versions.length > 0) {
          p.versions.forEach(function (v) {
            if (v.label) lines.push('[' + v.label + ']');
            if (v.content) lines.push(stripHtml(v.content));
          });
        } else if (p.description) {
          addLine(lines, '项目描述', p.description);
        }
      });
    }

    if (data.honors) lines.push('\n【荣誉证书】\n' + stripHtml(data.honors));
    if (data.selfEvaluation) lines.push('\n【自我评价】\n' + stripHtml(data.selfEvaluation));
    if (data.extraModules && data.extraModules.length > 0) {
      data.extraModules.forEach(function (m) {
        var title = m.name || '添加模块';
        lines.push('\n【' + title + '】');
        if (m.content) lines.push(stripHtml(m.content));
      });
    }

    return lines.join('\n');
  }

  function addLine(lines, label, value) {
    if (value) lines.push(label + '：' + stripHtml(value));
  }

  function stripHtml(html) {
    if (!html) return '';
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  function exportResume() {
    chrome.storage.local.get(RESUME_KEY, function (result) {
      var data = result[RESUME_KEY] || {};
      var text = formatResumeData(data);
      navigator.clipboard.writeText(text).then(function () {
        showToast('简历内容已复制到剪贴板');
      }, function () {
        showToast('复制失败，请手动复制');
      });
    });
  }

  // ===== TOC 高亮 =====
  function updateActiveTOC() {
    var links = document.querySelectorAll('.sidebar-link');
    var scrollY = window.scrollY + 100;
    var activeIdx = 0;
    links.forEach(function (link, i) {
      var target = document.querySelector(link.getAttribute('href'));
      if (target && target.offsetTop <= scrollY) activeIdx = i;
    });
    links.forEach(function (l, i) { l.classList.toggle('active', i === activeIdx); });
  }

  // ===== 初始化 =====
  document.addEventListener('DOMContentLoaded', function () {
    buildTOC();
    loadResume();

    document.getElementById('saveBtn').addEventListener('click', exportResume);
    document.getElementById('syncBtn').addEventListener('click', function () {
      showToast('功能开发中...');
    });

    // 关闭/刷新页面时保存
    window.addEventListener('beforeunload', function () { saveResume(true); });

    window.addEventListener('scroll', updateActiveTOC);
    updateActiveTOC();
  });
})();
