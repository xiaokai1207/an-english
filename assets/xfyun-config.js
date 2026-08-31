// An English · 跟读评分配置（讯飞开放平台 · 语音评测流式版）
//
// 开通步骤（免费）：
//   1. 注册 https://www.xfyun.cn/ 并登录控制台
//   2. 「我的应用」→ 创建新应用，记下 AppID
//   3. 在该应用下领取/开通「语音评测（流式版）」服务量，获取 APIKey 与 APISecret
//   4. 把三个凭证填到下面（引号内不要留空格）
//
// 免费额度：每天 500 次评测，日常学习绰绰有余。
// 不填也能正常使用 App，只是学习页会隐藏跟读按钮。

const XFYUN_ISE_CONFIG = {
  appId: '50689ba7',
  apiKey: '05d93e64fa7fbc390e0229b078b8f2e5',
  apiSecret: 'MWI3ZWVjZDNjY2QxZjQ5YTdiM2Q2MDFm',

  // 读对判定门槛（0-100）：达到该分数才算读对、解锁下一个单词。
  // 想更宽松就调低，更严格就调高。
  passScore: 10,
};
