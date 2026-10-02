// ============================================================
//  Oracle Arm (Ampere A1.Flex) 自动抢机 —— 完整版
//
//  用法：
//    node oci_grab.js auto    全自动：填向导 + 反复抢（推荐，默认）
//    node oci_grab.js fill    只把向导填一遍，填完停（用来核对）
//    node oci_grab.js retry   只反复点「创建」（向导已经填好时用它）
//
//  停止：在 pw 目录下建一个名为 oci_retry.stop 的空文件，
//        脚本下一轮会自己优雅退出（不要直接杀进程）。
//  配置：全部在 config.js 里改。
// ============================================================
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CFG = require('./config.js');
const PW = __dirname.replace(/\\/g, '/');
const HOME = process.env.USERPROFILE || process.env.HOME || '.';
const DESKTOP = HOME.replace(/\\/g, '/') + '/Desktop';
const LOG = PW + '/oci_retry.log';
const STOP = PW + '/oci_retry.stop';
const STATUS = PW + '/抢机状态.txt';
const RESULT = DESKTOP + '/抢到了-Arm服务器.txt';
const ANNOUNCE = PW + '/announce.bat';
const ANNOUNCE_STUCK = PW + '/announce_stuck.bat';
const MODE = process.argv[2] || 'auto';

function log(s) {
  const line = '[' + new Date().toLocaleString('zh-CN') + '] ' + s;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch (e) { }
}

function writeStatus(status, round, extra) {
  const txt = [
    '=========================================',
    '  自动抢 Oracle Arm 服务器 —— 运行状态',
    '=========================================',
    '',
    '状态：      ' + status,
    '地区：      ' + (CFG.regions.join(' -> ')),
    '第几次：    第 ' + round + ' 次',
    '更新时间：  ' + new Date().toLocaleString('zh-CN'),
    '',
    '这个文件每 ' + Math.round(CFG.intervalMs / 1000) + ' 秒刷新一次。',
    '“更新时间”跟现在差不到 5 分钟 = 还在抢；超过就是停了。',
    '',
    '详细说明：  ' + (extra || ''),
    '完整日志：  ' + PW + '\\oci_retry.log',
    '=========================================',
    ''
  ].join('\n');
  try { fs.writeFileSync(STATUS, txt, 'utf8'); } catch (e) { }
}

// ---------------- 通用小工具 ----------------

async function wizardFrame(page) {
  for (const f of page.frames()) {
    try {
      const t = await f.evaluate(() => (document.body ? document.body.innerText.slice(0, 6000) : ''));
      if (/创建计算实例|基本信息/.test(t)) return f;
    } catch (e) { }
  }
  return null;
}

const DEEP_INPUTS = () => {
  const out = [];
  const walk = (root, d) => {
    if (d > 14) return;
    root.querySelectorAll('input,textarea').forEach(el => {
      const r = el.getBoundingClientRect();
      let label = el.getAttribute('aria-label') || el.placeholder || '';
      if (!label) {
        let p = el;
        for (let i = 0; i < 8 && p; i++) { p = p.parentElement; if (p && (p.innerText || '').trim()) { label = p.innerText.replace(/\s+/g, ' ').trim().slice(0, 45); break; } }
      }
      out.push({ id: el.id || '', tag: el.tagName, type: el.type || '', label: label.slice(0, 45), val: String(el.value || '').slice(0, 50), w: Math.round(r.width), h: Math.round(r.height) });
    });
    root.querySelectorAll('*').forEach(el => { if (el.shadowRoot) walk(el.shadowRoot, d + 1); });
  };
  walk(document, 0);
  return out;
};

// 根据 label 文字找输入框 id（oj-label 的 id 形如 xxx-label，对应输入框 xxx-input）
// ★ 返回【所有】候选：页面里常有好几个同名 label（分组标题也叫「子网」），
//   只取第一个会取错，所以交给 pickCombo 一个个试到能弹出选项为止。
async function inputIdsByLabel(frame, re) {
  return await frame.evaluate((src) => {
    const rx = new RegExp(src);
    const out = [];
    const walk = (root, d) => {
      if (d > 14) return;
      root.querySelectorAll('label').forEach(l => {
        const t = (l.innerText || '').replace(/\s+/g, ' ').trim();
        if (!rx.test(t)) return;
        const fid = l.getAttribute('for');
        if (fid) { out.push({ id: fid, kind: 'for' }); return; }
        const lid = l.id || '';
        if (/-label$/.test(lid)) out.push({ id: lid.replace(/-label$/, '-input'), kind: 'derived' });
      });
      root.querySelectorAll('*').forEach(el => { if (el.shadowRoot) walk(el.shadowRoot, d + 1); });
    };
    walk(document, 0);
    // 只保留真实存在的、type 是 text 的输入框；derived 排后面
    const ok = out.filter(o => {
      const el = document.getElementById(o.id);
      return el && (el.type === 'text' || el.tagName === 'TEXTAREA');
    });
    return ok.sort((a, b) => (a.kind === 'for' ? -1 : 1)).map(o => o.id);
  }, re.source);
}

async function inputIdByLabel(frame, re) {
  const ids = await inputIdsByLabel(frame, re);
  return ids[0] || '';
}

async function clickText(page, frame, text) {
  const loc = frame.getByText(text, { exact: true }).first();
  if (!await loc.count()) { log('  没找到「' + text + '」'); return false; }
  await loc.scrollIntoViewIfNeeded().catch(() => { });
  await loc.click({ timeout: 15000 });
  await page.waitForTimeout(1200);
  return true;
}

async function pickCombo(page, frame, labelRe, optionRe, name) {
  const ids = await inputIdsByLabel(frame, labelRe);
  if (!ids.length) { log('  !!! 找不到下拉框：' + name); return false; }

  const readOpts = () => frame.evaluate(() => {
    const out = [];
    const walk = (root, d) => {
      if (d > 14) return;
      root.querySelectorAll('[role="option"],li,oj-option').forEach(el => {
        const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        const r = el.getBoundingClientRect();
        if (t && t.length < 90 && r.width > 0 && r.height > 0) out.push({ t, id: el.id || '' });
      });
      root.querySelectorAll('*').forEach(el => { if (el.shadowRoot) walk(el.shadowRoot, d + 1); });
    };
    walk(document, 0);
    return out;
  });

  let lastOpts = [];
  for (const id of ids) {
    const loc = frame.locator('#' + id).first();
    await loc.scrollIntoViewIfNeeded().catch(() => { });
    await loc.click({ timeout: 15000 });
    await page.waitForTimeout(2000);          // 下拉框要时间去后台拉列表
    let opts = await readOpts();
    if (!opts.length) { await page.waitForTimeout(2500); opts = await readOpts(); }  // 再等一轮
    lastOpts = opts.map(o => o.t);
    const hit = opts.find(o => optionRe.test(o.t));
    if (!hit) { await page.keyboard.press('Escape').catch(() => { }); continue; }

    // 点选项：优先用 id，其次用 role=option 过滤，最后才按文字（文字常点在内部 span 上会超时）
    let picked = false;
    if (hit.id) {
      picked = await frame.locator('#' + hit.id).first().click({ timeout: 8000 })
        .then(() => true).catch(() => false);
    }
    if (!picked) {
      picked = await frame.locator('[role="option"],li,oj-option')
        .filter({ hasText: optionRe }).first().click({ timeout: 8000 })
        .then(() => true).catch(() => false);
    }
    if (!picked) {
      picked = await frame.getByText(hit.t, { exact: false }).first()
        .click({ timeout: 8000, force: true }).then(() => true).catch(() => false);
    }
    if (!picked) { await page.keyboard.press('Escape').catch(() => { }); continue; }

    await page.waitForTimeout(1800);
    const now = await loc.inputValue().catch(() => '?');
    log('  ' + name + ' -> ' + hit.t + '（框里现在是：' + now + '）');
    return true;
  }
  log('  !!! 「' + name + '」没选上。试过的框：' + JSON.stringify(ids)
    + '，最后一次看到的选项：' + JSON.stringify(lastOpts.slice(0, 8)));
  return false;
}

// ---------------- 填向导 ----------------

async function fillWizard(page, region) {
  let frame = await wizardFrame(page);
  if (!frame) { log('填向导失败：找不到向导 iframe'); return false; }

  const T = () => frame.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));

  // --- 第 1 步 基本信息 ---
  if (!/名称/.test(await T())) { log('不在第 1 步'); return false; }

  const inputs1 = await frame.evaluate(DEEP_INPUTS);
  const nameInput = inputs1.find(i => i.type === 'text' && i.w > 500);
  if (nameInput) {
    await frame.locator('#' + nameInput.id).first().fill(CFG.name);
    log('名称 -> ' + CFG.name);
  }
  await page.waitForTimeout(600);

  // 打开配置面板
  if (!/配置系列/.test(await T())) {
    await frame.getByRole('button', { name: '更改配置' }).first().click({ timeout: 15000 });
    await page.waitForTimeout(3000);
  }
  // Ampere
  await clickText(page, frame, 'Ampere');
  await page.waitForTimeout(2200);

  // 选 A1.Flex 行
  const row = frame.locator('tr.oj-oci-table--body-row').filter({ hasText: 'VM.Standard.A1.Flex' }).first();
  if (!await row.count()) { log('配置列表里没有 A1.Flex'); return false; }
  await row.scrollIntoViewIfNeeded();
  await row.click({ timeout: 15000 });
  await page.waitForTimeout(1200);

  // 试着改 OCPU / 内存（免费账户下是锁死的，改不了就跳过）
  await trySetShapeConfig(page, frame);

  await frame.getByRole('button', { name: '选择配置' }).first().click({ timeout: 15000 });
  await page.waitForTimeout(3200);

  const after = await T();
  log('当前配置：' + (after.match(/配置 VM\.Standard\.\S+/g) || ['?'])[0]
    + ' | ' + (after.match(/虚拟机，\d+ 个核心 OCPU，\d+ GB 内存/) || ['?'])[0]);

  // --- 第 2 步 安全 ---
  await frame.getByRole('button', { name: '下一步' }).first().click({ timeout: 15000 });
  await page.waitForTimeout(3000);
  log('安全：直接下一步');

  // --- 第 3 步 网络 ---
  await frame.getByRole('button', { name: '下一步' }).first().click({ timeout: 15000 });
  await page.waitForTimeout(4200);
  frame = await wizardFrame(page) || frame;

  if (!/VNIC 名称/.test(await T())) {
    await frame.getByRole('button', { name: '下一步' }).first().click({ timeout: 15000 });
    await page.waitForTimeout(4200);
    frame = await wizardFrame(page) || frame;
  }

  if (CFG.networkMode === 'existing') {
    await clickText(page, frame, '选择现有虚拟云网络');
    await pickCombo(page, frame, /^虚拟云网络$/, new RegExp(CFG.existingVcn), '虚拟云网络');
    await page.waitForTimeout(2500);            // 选完 VCN，子网列表才开始加载
    await clickText(page, frame, '选择现有子网');
    await page.waitForTimeout(1500);
    const okSub = await pickCombo(page, frame, /^子网$/, new RegExp(CFG.existingSubnet), '子网');
    if (!okSub) {
      // 兜底：选不上现有子网，就让 Oracle 新建一个公共子网（否则拿不到公网 IP）
      log('  !!! 现有子网没选上，改成让 Oracle 新建公共子网（不然没有公网 IP）');
      await clickText(page, frame, '创建新公共子网');
      await page.waitForTimeout(2000);
    }
  } else {
    await clickText(page, frame, '创建新虚拟云网络');
    await clickText(page, frame, '创建新公共子网');
    log('网络：让 Oracle 自动新建 VCN + 公共子网');
  }

  // 公共 IPv4 打开
  const sw = await frame.evaluate(() => {
    const out = [];
    const walk = (root, d) => {
      if (d > 14) return;
      root.querySelectorAll('[role="switch"]').forEach(el => {
        let label = ''; let p = el;
        for (let i = 0; i < 6 && p; i++) { p = p.parentElement; if (p && (p.innerText || '').trim()) { label = p.innerText.trim().split('\n')[0].slice(0, 40); break; } }
        out.push({ label, checked: el.getAttribute('aria-checked'), w: Math.round(el.getBoundingClientRect().width) });
      });
      root.querySelectorAll('*').forEach(el => { if (el.shadowRoot) walk(el.shadowRoot, d + 1); });
    };
    walk(document, 0);
    return out;
  });
  const pub = sw.find(s => /自动分配公共 IPv4/.test(s.label));
  if (pub) {
    if (pub.checked === 'true') log('公共 IPv4：已经是开的');
    else {
      await frame.locator('[role="switch"]').filter({ hasText: '自动分配公共 IPv4 地址' }).first()
        .click({ timeout: 10000 }).catch(async () => {
          await frame.getByText('自动分配公共 IPv4 地址', { exact: false }).first().click();
        });
      log('公共 IPv4：已打开');
    }
  }

  // SSH 公钥
  let key = CFG.sshKey;
  try { key = fs.readFileSync(CFG.sshKeyFile, 'utf8').trim() || CFG.sshKey; } catch (e) { }
  await clickText(page, frame, '粘贴公共密钥');
  await page.waitForTimeout(1500);
  const kid = await inputIdByLabel(frame, /SSH 公共密钥/);
  if (kid) { await frame.locator('#' + kid).first().fill(key); log('SSH 公钥已粘贴'); }
  else log('!!! 没找到 SSH 公钥输入框，公钥没填进去');

  await page.waitForTimeout(800);

  // --- 第 4 步 存储 -> 复查 ---
  // ★ 陷阱：向导侧边栏里「复查」两个字从头到尾都在，不能用它判断到了复查页。
  //   唯一可靠的标志是页面底部出现「创建」按钮。
  const hasCreateBtn = () => frame.evaluate(() =>
    Array.from(document.querySelectorAll('button')).some(b => {
      const r = b.getBoundingClientRect();
      return (b.innerText || '').trim() === '创建' && r.width > 0;
    }));

  let ok = false;
  for (let i = 0; i < 3; i++) {
    frame = await wizardFrame(page) || frame;
    if (await hasCreateBtn().catch(() => false)) { ok = true; break; }
    const btn = frame.getByRole('button', { name: '下一步' }).first();
    if (!await btn.count()) break;
    await btn.scrollIntoViewIfNeeded().catch(() => { });
    await btn.click({ timeout: 15000 });
    await page.waitForTimeout(3500);
  }

  const finalTxt = await T();
  log('  复查页片段：' + finalTxt.slice(0, 260));
  log('填表结果：' + (ok ? '已到复查页' : '没到复查页，停在：' + finalTxt.slice(0, 80)));
  if (ok) {
    const m = finalTxt.match(/VM\.Standard\.A1\.Flex|VM\.Standard\.E2\.\S+/);
    const n = finalTxt.match(/\d+ 个核心 OCPU，\d+ GB 内存/);
    const pub = /公共 IPv4 地址 是/.test(finalTxt);
    const ssh = /ssh-ed25519|ssh-rsa/.test(finalTxt);
    log('复查核对：' + CFG.name + ' | ' + (m ? m[0] : '?') + ' | ' + (n ? n[0] : '?')
      + ' | 公网IP=' + (pub ? '是' : '否') + ' | SSH=' + (ssh ? '有' : '无'));
    if (!pub) log('  ★★★ 警告：公网 IP 是「否」！抢到了也连不上，必须修好再抢 ★★★');
    if (!ssh) log('  ★★★ 警告：SSH 公钥没填进去！抢到了也登不进去 ★★★');
    if (!/A1\.Flex/.test(finalTxt)) log('  ★★★ 警告：配置不是 A1.Flex，抢到的是别的规格 ★★★');
    return ok && pub && ssh;
  }
  return false;
}

async function trySetShapeConfig(page, frame) {
  const nums = await frame.evaluate(() => {
    const out = [];
    const walk = (root, d) => {
      if (d > 14) return;
      root.querySelectorAll('input').forEach(el => {
        const t = el.type;
        if (t !== 'number' && t !== 'text') return;
        let label = ''; let p = el;
        for (let i = 0; i < 8 && p; i++) { p = p.parentElement; if (p && (p.innerText || '').trim()) { label = p.innerText.replace(/\s+/g, ' ').trim().slice(0, 40); break; } }
        out.push({ id: el.id, val: String(el.value || ''), label, w: Math.round(el.getBoundingClientRect().width) });
      });
      root.querySelectorAll('*').forEach(el => { if (el.shadowRoot) walk(el.shadowRoot, d + 1); });
    };
    walk(document, 0);
    return out;
  });
  const cpu = nums.find(n => /OCPU/i.test(n.label) && n.w > 0 && n.w < 400);
  const mem = nums.find(n => /内存|Memory/i.test(n.label) && n.w > 0 && n.w < 400);
  if (!cpu && !mem) { log('  OCPU/内存：页面上没有可编辑的输入框（免费账户是锁死的），按默认的来'); return; }
  try {
    if (cpu) { await frame.locator('#' + cpu.id).first().fill(String(CFG.ocpu)); log('  OCPU -> ' + CFG.ocpu); }
    if (mem) { await frame.locator('#' + mem.id).first().fill(String(CFG.memory)); log('  内存 -> ' + CFG.memory + ' GB'); }
    await page.waitForTimeout(1200);
  } catch (e) { log('  改 OCPU/内存失败：' + e.message + '（多半是免费账户锁死，忽略）'); }
}

// ---------------- 抢到了 ----------------

function announce(dump) {
  const all = (dump.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || []);
  const pub = all.filter(ip => {
    const b = ip.split('.').map(Number);
    if (b[0] === 10 || b[0] === 127 || b[0] === 0 || b[0] === 255) return false;
    if (b[0] === 172 && b[1] >= 16 && b[1] <= 31) return false;
    if (b[0] === 192 && b[1] === 168) return false;
    if (b[0] === 169 && b[1] === 254) return false;
    return true;
  });
  const ip = pub[0] || '(没解析出来，去控制台看)';
  const txt = [
    '===========================================',
    '  抢到了！Oracle Arm 服务器已创建成功',
    '===========================================',
    '',
    '时间：    ' + new Date().toLocaleString('zh-CN'),
    '实例名：  ' + CFG.name,
    '规格：    VM.Standard.A1.Flex  ' + CFG.ocpu + ' 核 / ' + CFG.memory + 'G',
    '地区：    ' + (CFG.regions[0]),
    '公网 IP： ' + ip,
    '',
    'SSH 用户名：opc    （Oracle Linux 是 opc，Ubuntu 才是 ubuntu）',
    '连接命令：ssh -i "' + CFG.sshKeyFile.replace(/\.pub$/, '') + '" opc@' + ip,
    '',
    '===========================================',
    ''
  ].join('\r\n');
  try { fs.writeFileSync(RESULT, txt, 'utf8'); } catch (e) { }
  log('公网 IP = ' + ip + '；结果已写到 ' + RESULT);
  try { spawn('cmd', ['/c', ANNOUNCE], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { }
}

// ---------------- 主流程 ----------------

(async () => {
  if (fs.existsSync(STOP)) fs.unlinkSync(STOP);
  const browser = await chromium.connectOverCDP(CFG.cdp);
  const ctx = browser.contexts()[0];
  let page = null;
  for (const p of ctx.pages()) { if (/cloud\.oracle\.com/.test(p.url())) { page = p; break; } }
  if (!page) { log('找不到 Oracle 页面，先打开控制台并登录'); await browser.close(); process.exit(2); }
  await page.bringToFront();

  let round = 0, stuck = 0;
  let ri = 0;                       // 当前地区下标
  let failInRegion = 0;

  for (;;) {
    const region = CFG.regions[ri];
    const url = 'https://cloud.oracle.com/compute/instances/create?region=' + region;

    // 切地区 / 首次进入：重新导航并填一遍向导
    if (page.url() !== url || MODE !== 'retry') {
      log('=== 打开向导：' + region + ' ===');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(14000);
      if (!await fillWizard(page, region)) {
        log('填向导失败，10 分钟后重试');
        writeStatus('填向导失败，等待重试', round, '地区 ' + region);
        await page.waitForTimeout(10 * 60 * 1000);
        continue;
      }
      if (MODE === 'fill') { log('只填表模式，到此结束'); break; }
      failInRegion = 0;
    }

    // ---- 抢（反复点创建）----
    for (;;) {
      if (fs.existsSync(STOP)) { log('检测到停止标志，退出'); await browser.close(); return; }
      if (round >= CFG.maxRounds) { log('到达最大轮数，结束'); await browser.close(); return; }
      round++;

      let fr = await wizardFrame(page);
      if (!fr) {
        const u = page.url();
        const isInstance = /\/instance[s]?\//.test(u) || u.includes('ocid1.instance');
        log('#' + round + ' 不在创建页 URL=' + u.slice(0, 90));
        if (isInstance) {
          let dump = '';
          for (const f of page.frames()) { try { dump += await f.evaluate(() => document.body.innerText); } catch (e) { } }
          try { fs.writeFileSync(PW + '/oci_success.txt', dump, 'utf8'); } catch (e) { }
          try { await page.screenshot({ path: PW + '/oci_success.png' }); } catch (e) { }
          log('=== 抢到了！已跳转到实例页 ===');
          announce(dump);
          await browser.close();
          return;
        }
        stuck++;
        writeStatus('卡住了（第 ' + stuck + ' 次）', round, '找不到创建向导页面（浏览器被关/掉线/页面被刷新）');
        if (stuck >= 3) {
          try { fs.writeFileSync(STATUS, '卡住了：连续 3 次找不到向导页\n请重新双击「一键抢Arm服务器.bat」，并确保 Oracle 已登录\n', 'utf8'); } catch (e) { }
          try { spawn('cmd', ['/c', ANNOUNCE_STUCK], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { }
          log('=== 连续 3 次找不到向导页，停止并弹窗 ===');
          await browser.close();
          process.exit(2);
        }
        await page.waitForTimeout(CFG.intervalMs);
        continue;
      }
      stuck = 0;

      // 点「创建」
      const off = await page.evaluate(() => {
        const ifr = Array.from(document.querySelectorAll('iframe')).find(f => {
          try { return f.contentDocument && f.contentDocument.body && f.contentDocument.body.innerText.includes('创建计算实例'); } catch (e) { return false; }
        });
        if (!ifr) return null;
        const r = ifr.getBoundingClientRect();
        return { x: r.x, y: r.y };
      });
      let clicked = false;
      if (off) {
        await fr.evaluate(() => {
          const el = Array.from(document.querySelectorAll('button')).find(e => (e.innerText || '').trim() === '创建');
          if (el) el.scrollIntoView({ block: 'center' });
        });
        await page.waitForTimeout(700);
        const b = await fr.evaluate(() => {
          const el = Array.from(document.querySelectorAll('button')).find(e => (e.innerText || '').trim() === '创建');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, disabled: el.disabled };
        });
        if (b && !b.disabled) { await page.mouse.click(off.x + b.x, off.y + b.y); clicked = true; }
      }
      await page.waitForTimeout(9000);

      let status = '未知', detail = '';
      for (const f of page.frames()) {
        let t = '';
        try { t = await f.evaluate(() => (document.body ? document.body.innerText : '')); } catch (e) { }
        if (!t) continue;
        if (t.includes('容量不足')) status = '容量不足';
        else if (/正在预配|正在运行|Provisioning|Running/i.test(t) && !t.includes('创建计算实例')) status = '成功?';
        const m = t.match(/API 错误|无法|错误[^\n]{0,80}/);
        if (m) detail = m[0].slice(0, 100);
      }
      if (!page.url().includes('/create')) status = '成功(已跳转)';
      if (status === '未知' && detail) status = '容量不足';

      log('#' + round + ' [' + region + '] clicked=' + clicked + ' 状态=' + status + (detail ? ' | ' + detail : ''));
      writeStatus(status === '容量不足' ? '正在抢（还没抢到，暂时没货）' : status, round,
        clicked ? '已点「创建」，Oracle 回：' + (detail || status) : '这次没点到「创建」按钮');

      if (status.startsWith('成功')) {
        let dump = '';
        for (const f of page.frames()) { try { dump += await f.evaluate(() => document.body.innerText); } catch (e) { } }
        try { fs.writeFileSync(PW + '/oci_success.txt', dump, 'utf8'); } catch (e) { }
        try { await page.screenshot({ path: PW + '/oci_success.png' }); } catch (e) { }
        log('=== 抢到了！===');
        announce(dump);
        await browser.close();
        return;
      }

      failInRegion++;
      if (CFG.regions.length > 1 && failInRegion >= CFG.rotateAfter) {
        log('这个地区连续 ' + failInRegion + ' 次没货，换下一个地区');
        ri = (ri + 1) % CFG.regions.length;
        failInRegion = 0;
        break;                 // 回到外层重新导航 + 填表
      }

      const rest = CFG.intervalMs - 9000;
      if (rest > 0) await page.waitForTimeout(rest);
    }
  }

  await browser.close();
})().catch(e => { log('FATAL ' + e.message); process.exit(1); });
