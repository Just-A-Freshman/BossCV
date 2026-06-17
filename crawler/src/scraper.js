/**
 * Boss直聘岗位信息爬虫 v6（最终版）
 *
 * 策略：
 * 1. 从 Fiddler 导出的 tokens 认证
 * 2. 搜索 API 获取岗位列表（含 securityId）
 * 3. 详情 API 获取完整岗位描述（按页间隔请求，绕过 WAF）
 * 4. 断点续爬（已获取的不会重复请求）
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 配置区
// ============================================================
const CONFIG = {
  apiParams: {
    city: '101280100',
    jobType: '1902',
    query: 'Agent',
    pageSize: 15,
    scene: 1,
  },
  maxPages: 10,
  delayBetweenPages: 6000,   // 翻页间隔(ms) — 放慢避免 WAF
  delayBetweenDetails: 5000, // 详情间隔(ms)
  retryMax: 3,               // 详情 API 失败重试次数
  retryDelay: 8000,          // 重试间隔基础值(ms)

  configFile: path.join(__dirname, '..', 'data', 'config.json'),
  outputFile: path.join(__dirname, '..', 'data', 'jobs.json'),
  progressFile: path.join(__dirname, '..', 'data', 'progress.json'),
};

// ============================================================
// HTTP 工具
// ============================================================
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function genTraceId() {
  const h = Date.now().toString(16);
  const c = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let r = '';
  for (let i = 0; i < 10; i++) r += c[Math.floor(Math.random() * 62)];
  return 'F-' + h.slice(-6) + r;
}

function buildHeaders(referer) {
  const config = JSON.parse(fs.readFileSync(CONFIG.configFile, 'utf-8'));
  return {
    'Cookie': config.cookie,
    'zp_token': config.zp_token,
    'token': config.token,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    'Accept-Encoding': 'gzip, deflate',
    'Origin': 'https://www.zhipin.com',
    'X-Requested-With': 'XMLHttpRequest',
    'traceId': genTraceId(),
    'sec-ch-ua': '"Microsoft Edge";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Referer': referer,
  };
}

async function fetchAPI(url, opts = {}) {
  const headers = { ...buildHeaders(opts.referer || 'https://www.zhipin.com/web/geek/jobs') };
  const fo = { method: opts.method || 'GET', headers };
  if (opts.body) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; fo.body = opts.body; }
  const res = await fetch(url, fo);
  return await res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// 搜索 API
// ============================================================
async function searchJobs(pageNum) {
  const params = new URLSearchParams({
    page: String(pageNum),
    pageSize: String(CONFIG.apiParams.pageSize),
    city: CONFIG.apiParams.city,
    jobType: CONFIG.apiParams.jobType,
    query: CONFIG.apiParams.query,
    expectInfo: '', multiSubway: '', multiBusinessDistrict: '',
    position: '', salary: '', experience: '', degree: '', industry: '',
    scale: '', stage: '', scene: String(CONFIG.apiParams.scene),
    encryptExpectId: '',
  });

  const data = await fetchAPI(
    'https://www.zhipin.com/wapi/zpgeek/search/joblist.json?_=' + Date.now(),
    { method: 'POST', body: params }
  );

  if (data.code !== 0 && data.code !== 1) {
    throw new Error(`搜索API: code=${data.code} ${data.message}`);
  }

  return {
    jobs: data.zpData?.jobList || [],
    hasMore: data.zpData?.hasMore !== false,
  };
}

// ============================================================
// 详情 API（含重试）
// ============================================================
async function getJobDetail(securityId, lid) {
  const data = await fetchAPI(
    `https://www.zhipin.com/wapi/zpgeek/job/detail.json?securityId=${encodeURIComponent(securityId)}&lid=${lid}&_=${Date.now()}`
  );
  if (data.code !== 0 && data.code !== 1) return null;
  const d = data.zpData;
  return typeof d.jobInfo === 'string' ? JSON.parse(d.jobInfo) : d.jobInfo;
}

async function getJobDetailWithRetry(securityId, lid, label) {
  for (let attempt = 1; attempt <= CONFIG.retryMax; attempt++) {
    try {
      const detail = await getJobDetail(securityId, lid);
      if (detail && detail.postDescription) {
        if (attempt > 1) console.log(`    (第${attempt}次尝试成功)`);
        return detail;
      }
      if (detail && !detail.postDescription) {
        // 请求成功但描述为空——可能内容如此，视为成功
        return detail;
      }
    } catch (e) {
      // 网络错误等
    }
    if (attempt < CONFIG.retryMax) {
      const wait = CONFIG.retryDelay * attempt; // 递增延迟
      console.log(`    (第${attempt}次失败, ${wait / 1000}s 后重试...)`);
      await sleep(wait);
    }
  }
  console.log(`    (重试${CONFIG.retryMax}次均失败，跳过)`);
  return null;
}

// ============================================================
// 岗位数据合并
// ============================================================
function parseJob(listItem, detailInfo) {
  return {
    id: listItem.encryptJobId || '',
    title: listItem.jobName || '',
    salary: listItem.salaryDesc || '',
    city: listItem.cityName || '',
    district: listItem.areaDistrict || '',
    businessDistrict: listItem.businessDistrict || '',
    experience: listItem.jobExperience || '',
    education: listItem.jobDegree || '',
    daysPerWeek: listItem.daysPerWeekDesc || '',
    leastMonth: listItem.leastMonthDesc || '',
    skills: listItem.jobLabels || [],
    skills2: listItem.skills || [],
    welfareList: listItem.welfareList || [],

    company: {
      name: listItem.brandName || '',
      industry: listItem.brandIndustry || '',
      scale: listItem.brandScaleName || '',
      stage: listItem.brandStageName || '',
      logo: listItem.brandLogo || '',
      encryptBrandId: listItem.encryptBrandId || '',
    },

    recruiter: {
      name: listItem.bossName || '',
      title: listItem.bossTitle || '',
      avatar: listItem.bossAvatar || '',
      online: listItem.bossOnline || false,
    },

    detailUrl: listItem.encryptJobId
      ? `https://www.zhipin.com/job_detail/${encodeURIComponent(listItem.encryptJobId)}.html`
      : '',

    // 从详情 API 补充的字段
    description: detailInfo?.postDescription || '',
    descriptionShort: detailInfo?.postDescription
      ? detailInfo.postDescription.substring(0, 200)
      : '',
    address: detailInfo?.address || '',
    location: listItem.gps || null,
    showSkills: detailInfo?.showSkills || [],
    recruitmentCount: detailInfo?.recruitmentCountDesc || '',
    updateTime: detailInfo?.jobStatusDesc || '',
    invalidStatus: detailInfo?.invalidStatus ?? false,

    // 内部字段（用于断点续爬）
    _securityId: listItem.securityId || '',
    _lid: listItem.lid || '',
  };
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  console.log('========================================');
  console.log('  Boss直聘 岗位信息爬虫 v6');
  console.log(`  关键词: ${CONFIG.apiParams.query}`);
  console.log(`  城市:   广州 | 最大页: ${CONFIG.maxPages}`);
  console.log('========================================\n');

  // 读取已有进度（断点续爬）
  let progress = { completedIds: [], allJobs: [] };
  if (fs.existsSync(CONFIG.progressFile)) {
    try {
      progress = JSON.parse(fs.readFileSync(CONFIG.progressFile, 'utf-8'));
      console.log(`[进度] 已有 ${progress.allJobs.length} 个岗位, ${progress.completedIds.length} 个已完成详情\n`);
    } catch {}
  }

  // ── 第1阶段: 搜索全部页面 ──
  let newJobs = [];
  for (let page = 1; page <= CONFIG.maxPages; page++) {
    console.log(`[搜索] 第${page}页...`);
    try {
      const result = await searchJobs(page);
      if (result.jobs.length === 0) {
        console.log('  无更多数据');
        break;
      }
      newJobs = newJobs.concat(result.jobs);
      console.log(`  +${result.jobs.length} 个（累计 ${newJobs.length}）`);
      if (!result.hasMore) {
        console.log('  已到最后一页');
        break;
      }
      await sleep(CONFIG.delayBetweenPages);
    } catch (e) {
      console.log(`  [错误] ${e.message}`);
      break;
    }
  }

  // 合并到总列表（去重）
  const existingIds = new Set(progress.allJobs.map(j => j.id));
  for (const nj of newJobs) {
    const id = nj.encryptJobId;
    if (!existingIds.has(id)) {
      progress.allJobs.push(nj);
      existingIds.add(id);
    }
  }
  console.log(`\n[合并] 共 ${progress.allJobs.length} 个岗位\n`);

  // ── 第2阶段: 获取详情描述 ──
  const pending = progress.allJobs.filter(j => j.encryptJobId && !progress.completedIds.includes(j.encryptJobId));
  console.log(`[详情] 待获取 ${pending.length} 个岗位的详细描述\n`);

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    const sid = item.securityId;
    const lid = item.lid;

    if (!sid || !lid) {
      console.log(`  [${i + 1}/${pending.length}] ${item.jobName} — 跳过（无securityId）`);
      progress.completedIds.push(item.encryptJobId);
      saveProgress(progress);
      continue;
    }

    const label = `${item.jobName} @ ${item.brandName || ''}`;
    process.stdout.write(`  [${i + 1}/${pending.length}] ${label} ...`);
    const detail = await getJobDetailWithRetry(sid, lid, label);

    if (detail) {
      item._detail = detail;
      const descLen = (detail.postDescription || '').length;
      console.log(` ✓ (${descLen}字)`);
    } else {
      console.log(` ✗ 无描述`);
    }

    progress.completedIds.push(item.encryptJobId);
    saveProgress(progress);

    if (i < pending.length - 1) {
      await sleep(CONFIG.delayBetweenDetails);
    }
  }

  // ── 第3阶段: 输出 ──
  const outputData = {
    config: {
      query: CONFIG.apiParams.query,
      city: CONFIG.apiParams.city,
      jobType: CONFIG.apiParams.jobType,
      scrapeTime: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
    },
    total: progress.allJobs.length,
    completedDetails: progress.completedIds.length,
    jobs: progress.allJobs.map(j => parseJob(j, j._detail)),
  };

  fs.writeFileSync(CONFIG.outputFile, JSON.stringify(outputData, null, 2), 'utf-8');

  console.log(`\n✓ 完成！${outputData.total} 个岗位`);
  console.log(`✓ 已保存到 ${CONFIG.outputFile}`);
  console.log(`✓ 其中 ${outputData.completedDetails} 个有完整描述`);

  // 清理进度文件
  fs.unlinkSync(CONFIG.progressFile);
}

function saveProgress(progress) {
  fs.writeFileSync(CONFIG.progressFile, JSON.stringify(progress, null, 2), 'utf-8');
}

main().catch((e) => {
  console.error(`\n[错误] ${e.message}`);
});
