// detail-page-reader.js
// 在 BOSS直聘岗位详情页（隐藏 Tab）中运行，读取完整岗位信息
(function () {
  'use strict';

  if (!location.pathname.includes('/job_detail/')) return;

  // ============================================================
  // 文本清理（参考 extract_job_detail.js）
  // ============================================================
  function cleanText(str) {
    if (!str) return '';
    return str
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<span[^>]*>.*?<\/span>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/[\t]+/g, '')
      .split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length > 0 && l.length > 2; })
      .join('\n');
  }

  function extractSection(selector) {
    var el = document.querySelector(selector);
    return el ? cleanText(el.innerHTML) : '';
  }

  // ============================================================
  // 读取岗位详情（strictly follows extract_job_detail.js）
  // ============================================================
  function readJobDetail() {
    var titleEl = document.querySelector('.job-title');
    if (!titleEl) return null;

    // ---- 岗位基本信息 ----
    var jobTitle = document.querySelector('.job-title')?.textContent?.trim() || '';
    var salary   = document.querySelector('.badge')?.textContent?.trim() || '';

    // ---- 岗位元信息（属地/工作时间/学历） ----
    var city   = document.querySelector('a.text-desc.text-city')?.textContent?.trim() || '';
    var workSchedule = document.querySelector('span.text-desc.text-experiece')?.textContent?.trim() || '';
    var education    = document.querySelector('span.text-desc.text-degree')?.textContent?.trim() || '';

    // 公司：严格按 extract_job_detail.js 顺序
    var infoEl = document.querySelector('.info');
    var companyName = '';
    if (infoEl && infoEl.childNodes && infoEl.childNodes[0]) {
      companyName = (infoEl.childNodes[0].textContent || '').trim();
    }
    if (!companyName) {
      var altInfo = document.querySelector('.company-info .name + .info');
      if (altInfo) companyName = altInfo.textContent.trim();
    }

    // ---- 公司基本信息（侧边栏） ----
    function getSiderText(iconClass) {
      var el = document.querySelector('.sider-company .' + iconClass);
      if (!el) return '';
      var parent = el.parentElement;
      return parent ? parent.textContent.trim() : el.textContent.trim();
    }
    var stage    = getSiderText('icon-stage');
    var scale    = getSiderText('icon-scale');
    var industry = getSiderText('icon-industry');

    // ---- 技能/福利标签 ----
    var tagItems = document.querySelectorAll('.job-detail .tag-item, .job-keyword');
    var tags = [];
    tagItems.forEach(function (el) {
      var t = (el.textContent || '').trim();
      if (t && t.length < 50) tags.push(t);
    });

    var skillItems = document.querySelectorAll('.job-keyword-list .keyword-item, .tag-container .tag');
    var skills = [];
    skillItems.forEach(function (el) {
      var s = (el.textContent || '').trim();
      if (s && s.length < 30) skills.push(s);
    });

    var welfareItems = document.querySelectorAll('.welfare-list .welfare-item, .welfare-tag-list .welfare-tag');
    var welfare = [];
    welfareItems.forEach(function (el) {
      var w = (el.textContent || '').trim();
      if (w && w.length < 20) welfare.push(w);
    });

    // ---- 岗位描述 ----
    var jobDesc = extractSection('.job-detail .job-sec-text');

    // ---- 公司介绍 ----
    var companyIntro = extractSection('.company-info-box .job-sec-text');

    // ---- 工商信息 ----
    var bizItems = document.querySelectorAll('.business-info-box .level-list li');
    var bizInfo = [];
    bizItems.forEach(function (li) {
      var span = li.querySelector('span');
      var label = span ? span.textContent.trim() : '';
      var value = li.textContent.replace(label, '').trim();
      bizInfo.push(label + '：' + value);
    });

    // ---- 工作地址 ----
    var address = document.querySelector('.location-address')?.textContent?.trim() || '';

    return {
      title:       jobTitle,
      salary:      salary,
      company:     companyName || '(未找到)',
      stage:       stage    || '(未找到)',
      scale:       scale    || '(未找到)',
      industry:    industry || '(未找到)',
      tags:        tags.slice(0, 20),
      skills:      skills.slice(0, 30),
      welfare:     welfare.slice(0, 20),
      description: (jobDesc || '(无)').slice(0, 8000),
      companyIntro: (companyIntro || '(无)').slice(0, 2000),
      bizInfo:     bizInfo.slice(0, 10),
      address:     address || '(未找到)',
      url:         location.href,
      city:        city || '(未找到)',
      workSchedule: workSchedule || '(未找到)',
      education:   education || '(未找到)',
    };
  }

  // ============================================================
  // 轮询等待 DOM 渲染
  // ============================================================
  var maxWait = 15000;
  var interval = 500;
  var waited = 0;

  function tryRead() {
    waited += interval;
    var data = readJobDetail();
    if (data || waited >= maxWait) {
      chrome.runtime.sendMessage({
        type: 'jobDetailData',
        data: data || { error: '超时，未能提取岗位信息' }
      });
      return;
    }
    setTimeout(tryRead, interval);
  }

  setTimeout(tryRead, interval);
})();
