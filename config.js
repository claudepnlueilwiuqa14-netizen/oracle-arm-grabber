// ============================================================
//  抢机配置 —— 只用改这个文件，别动 oci_grab.js
// ============================================================
module.exports = {

  // ---------- 抢哪些地区（按顺序轮换，第一个抢到就停）----------
  // 常用地区代号：
  //   ap-tokyo-1     日本东京   （你的主区域，★免费额度只在这里生效）
  //   ap-osaka-1     日本大阪
  //   ap-seoul-1     韩国首尔
  //   ap-singapore-1 新加坡
  //   ap-sydney-1    澳大利亚悉尼
  //   us-phoenix-1   美国凤凰城 （Arm 资源最充足，社区公认最容易抢）
  //   us-ashburn-1   美国阿什本
  //   eu-frankfurt-1 德国法兰克福
  //
  // ⚠️⚠️ 重要：Oracle 官方规定 Always Free 的 A1 只能在【主区域】开。
  //     你的主区域是东京。所以在东京以外抢到的机器【会按量扣费】。
  //     默认只填东京，就是为了不让你糊里糊涂花钱。
  regions: ['ap-tokyo-1'],

  // 一个地区连续失败多少次后换下一个地区（默认 40 次 ≈ 45 分钟）
  rotateAfter: 40,

  // ---------- 机器规格 ----------
  name: 'arm-big-01',

  // Ampere A1 的免费额度上限 = 总共 2 OCPU + 12 GB（2026-08 起，官方已确认）
  // 你现在 A1 额度是空的（现有两台都是 E2.1.Micro），所以 2核12G 全拿也不花钱。
  // ★ 千万别超过 2/12，超了就开始扣费。
  // ★ 免费账户下这两个值是锁死的（强制 1 核 6G），升级 PAYG 后才会解锁。
  ocpu: 2,
  memory: 12,

  // ---------- 网络 ----------
  // 主网络：'existing' 用现有 VCN / 'new' 让 Oracle 自动新建
  // （换地区时必须用 'new'，因为 VCN 是按地区独立的，大阪没有东京的 VCN）
  networkMode: 'existing',
  existingVcn: 'vcn-20260924-1907',        // networkMode='existing' 时用这个名字
  existingSubnet: 'subnet-20260924-1907',

  // ---------- SSH 公钥 ----------
  // 换成你自己的公钥文件也行，或者直接把内容粘在 sshKey 里
  sshKeyFile: 'C:/Users/qq/Desktop/dongjingkey/oci-console-2026-09-30.pub',
  sshKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG+jROS8AqMzTMA/JDIm0msArQc3AMU9APCnXDBaoRHN oci-serial-console-2026-09-30',

  // ---------- 节奏 ----------
  intervalMs: 70000,   // 每轮间隔 70 秒（别调太快，太快会被限流反而不利）
  maxRounds: 9999,     // 最多抢多少轮；9999 ≈ 一直挂着

  // ---------- 浏览器 ----------
  cdp: 'http://127.0.0.1:9222',
};
