// 自动抢 Arm 实例：每 70 秒点一次“创建”，抢到就停
// 用法: node oci_retry.js [最大尝试次数]
const { chromium } = require('playwright-core');
const fs = require('fs');
const { spawn } = require('child_process');

// 路径全部相对脚本自身，换台电脑/换个用户名也能直接用
const PW = __dirname.replace(/\\/g, '/');
const HOME = process.env.USERPROFILE || process.env.HOME || '.';
const DESKTOP = HOME.replace(/\\/g, '/') + '/Desktop';
const ANNOUNCE = PW + '/announce.bat';
const RESULT = DESKTOP + '/抢到了-Arm服务器.txt';

// 从页面文本里挑出公网 IPv4
function pickPublicIp(text) {
  const all = (text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || []);
  const pub = all.filter(ip => {
    const b = ip.split('.').map(Number);
    if (b[0] === 10 || b[0] === 127 || b[0] === 0 || b[0] === 255) return false;
    if (b[0] === 169 && b[1] === 254) return false;
    if (b[0] === 172 && b[1] >= 16 && b[1] <= 31) return false;
    if (b[0] === 192 && b[1] === 168) return false;
    return true;
  });
  return pub.length ? pub[0] : '(没抓到，去控制台实例详情页看)';
}

// 抢到了 → 写结果文件 + 弹窗 + 响铃
function announce(dump) {
  const ip = pickPublicIp(dump);
  const txt = [
    '===========================================',
    '  抢到了！Oracle Arm 免费服务器已创建成功',
    '===========================================',
    '',
    '时间：  ' + new Date().toLocaleString('zh-CN'),
    '实例名：arm-big-01',
    '规格：  VM.Standard.A1.Flex  1 核 / 6G 内存  （符合始终免费条件）',
    '地区：  日本东京 ap-tokyo-1  AD-1',
    '系统：  Oracle Linux 9',
    '公网 IP：' + ip,
    '',
    'SSH 登录用户名：opc      （Oracle Linux 的用户名是 opc，不是 ubuntu）',
    '私钥文件：C:\\Users\\qq\\Desktop\\dongjingkey\\oci-console-2026-09-30',
    '连接命令：ssh -i "C:\\Users\\qq\\Desktop\\dongjingkey\\oci-console-2026-09-30" opc@' + ip,
    '',
    '下一步：喊一声泽泽，我给你装图形桌面（和东京那台一样可以远程桌面）。',
    '===========================================',
    ''
  ].join('\r\n');
  try { fs.writeFileSync(RESULT, txt, 'utf8'); } catch (e) { log('写结果文件失败: ' + e.message); }
  log('公网 IP = ' + ip + '；结果已写到 ' + RESULT);
  try {
    spawn('cmd', ['/c', ANNOUNCE], { detached: true, stdio: 'ignore' }).unref();
    log('已弹出提示窗口 announce.bat');
  } catch (e) { log('弹窗失败: ' + e.message); }
}

const LOG = PW + '/oci_retry.log';
const STOP = PW + '/oci_retry.stop';
const MAX = parseInt(process.argv[2] || '600', 10);   // 600 * 70s ≈ 11.6 小时
const INTERVAL = 70000;

function log(s) {
  const line = '[' + new Date().toLocaleString('zh-CN') + '] ' + s;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch (e) { }
}

const STATUS_FILE = PW + '/抢机状态.txt';

// 每轮都往状态文件里写一次“心跳”，文件不更新 = 脚本挂了
function heartbeat(i, status, extra) {
  const now = new Date();
  const txt = [
    '=========================================',
    '  自动抢 Oracle Arm 服务器 —— 运行状态',
    '=========================================',
    '',
    '状态：      ' + status,
    '第几次：    第 ' + i + ' 次',
    '更新时间：  ' + now.toLocaleString('zh-CN'),
    '',
    '怎么判断它还活着：',
    '  这个文件每 70 秒左右会被刷新一次。',
    '  只要“更新时间”跟现在差不到 3 分钟，就说明还在抢。',
    '  超过 3 分钟没变 = 脚本停了，重新双击「一键抢Arm服务器.bat」。',
    '',
    '详细说明：  ' + (extra || ''),
    '完整日志：  ' + PW + '\\oci_retry.log',
    '=========================================',
    ''
  ].join('\n');
  try { fs.writeFileSync(STATUS_FILE, txt, 'utf8'); } catch (e) { }
}

// 卡住了（向导页面丢了）→ 弹窗喊人，并且用退出码 2 结束，别让看门狗白重启
function announceStuck(reason) {
  try { fs.writeFileSync(STATUS_FILE, '卡住了：' + reason + '\n需要你手动处理：重新双击「一键抢Arm服务器.bat」\n', 'utf8'); } catch (e) { }
  try { spawn('cmd', ['/c', PW + '/announce_stuck.bat'], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { }
}

async function formFrame(page) {
  for (const f of page.frames()) {
    try { const t = await f.evaluate(() => document.body ? document.body.innerText : ''); if (t && t.includes('创建计算实例')) return f; } catch (e) { }
  }
  return null;
}

(async () => {
  if (fs.existsSync(STOP)) fs.unlinkSync(STOP);
  log('=== 开始抢 Arm 实例 (最多 ' + MAX + ' 次, 间隔 ' + (INTERVAL / 1000) + 's) ===');
  let stuckCount = 0;

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  let page = null;
  for (const p of ctx.pages()) { if (p.url().includes('oracle.com')) { page = p; break; } }
  if (!page) { log('找不到 Oracle 页面，退出'); await browser.close(); return; }
  await page.bringToFront();
  log('已连接页面: ' + page.url());

  for (let i = 1; i <= MAX; i++) {
    if (fs.existsSync(STOP)) { log('检测到停止标志，退出'); break; }

    let fr = await formFrame(page);
    if (!fr) {
      const url = page.url();
      // 只有真的跳到“实例详情页”才算成功；掉线/跳登录页不能误报
      const isInstancePage = /\/instance[s]?\//.test(url) || url.includes('ocid1.instance');
      log('#' + i + ' 不在创建页 URL=' + url + ' isInstancePage=' + isInstancePage);
      if (isInstancePage) {
        let dump = '';
        for (const f of page.frames()) { try { dump += await f.evaluate(() => document.body.innerText); } catch (e) { } }
        await page.screenshot({ path: PW + '/oci_success.png' });
        fs.writeFileSync(PW + '/oci_success.txt', dump, 'utf8');
        log('=== 抢到了（已跳转到实例页）===');
        announce(dump);
        break;
      }
      log('  不是实例页（可能掉线/超时），继续下一轮');
      stuckCount++;
      heartbeat(i, '卡住了（第 ' + stuckCount + ' 次）', '找不到创建向导页面，可能是浏览器被关了或掉线了');
      if (stuckCount >= 3) {
        log('=== 连续 3 次找不到向导页，停止并弹窗喊人 ===');
        announceStuck('连续 3 次找不到 Oracle 创建向导页面（浏览器被关/掉线/页面被刷新）。需要重新打开并填一遍向导。');
        await browser.close();
        process.exit(2);
      }
      await page.waitForTimeout(INTERVAL);
      continue;
    }

    // 点“创建”
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
      if (b && !b.disabled) {
        await page.mouse.click(off.x + b.x, off.y + b.y);
        clicked = true;
      }
    }

    await page.waitForTimeout(9000);

    // 检查结果
    let status = '未知';
    let detail = '';
    for (const f of page.frames()) {
      let t = '';
      try { t = await f.evaluate(() => document.body ? document.body.innerText : ''); } catch (e) { }
      if (!t) continue;
      if (t.includes('容量不足')) { status = '容量不足'; }
      else if (/正在预配|正在运行|Running|Provisioning/i.test(t) && !t.includes('创建计算实例')) { status = '成功?'; }
      const m = t.match(/API 错误|无法|错误[^\n]{0,80}/);
      if (m) detail = m[0].slice(0, 100);
    }
    if (!page.url().includes('/create')) status = '成功(已跳转)';
    if (status === '未知' && detail) status = '容量不足';

    log('#' + i + ' clicked=' + clicked + ' 状态=' + status + (detail ? ' | ' + detail : '') + ' | URL=' + page.url().slice(0, 90));
    stuckCount = 0;
    heartbeat(i, status === '容量不足' ? '正在抢（还没抢到，东京暂时没货）' : status,
      clicked ? '这次已经点了「创建」，Oracle 回的是：' + (detail || status) : '这次没点到「创建」按钮');

    if (status.startsWith('成功')) {
      await page.screenshot({ path: PW + '/oci_success.png' });
      log('=== 抢到了！截图已存 oci_success.png ===');
      // 抓取页面文本解析公网 IP，并弹窗通知
      let dump = '';
      for (const f of page.frames()) { try { dump += await f.evaluate(() => document.body.innerText); } catch (e) { } }
      fs.writeFileSync(PW + '/oci_success.txt', dump, 'utf8');
      announce(dump);
      break;
    }

    // 等待下一轮（减去已等待的 9 秒）
    const rest = INTERVAL - 9000;
    if (i < MAX) await page.waitForTimeout(rest);
  }

  log('=== 抢机循环结束 ===');
  await browser.close();
})().catch(e => { log('FATAL ' + e.message); process.exit(1); });
