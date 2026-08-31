# An English 🐥

把《幼儿英语培养计划》变成孩子能自己点着玩的互动教材。零依赖、纯静态、离线可用。

在线体验：**https://xiaokai1207.github.io/an-english/**

## 功能

- **🏠 Today** — 每日任务：本周主题、学新词、玩游戏，星星与连续打卡激励
- **📖 Learn** — 每日闪卡：新词 + 弱词复习自动混排，点击听发音，学完撒花加星；中文释义旁有 **「中」按钮**可朗读中文；**🎤 跟读评分**：听完后点「Read after me」大声跟读，讯飞云端评测发音，读对播放活泼提示音并解锁下一个词（需配置，见下文）
- **🎮 Play** — 听音选图（听力辨音）、翻牌配对（复习巩固）两个小游戏
- **📚 My Words** — 单词本：按周分组，掌握度星级，点卡片随时复习发音
- **🔒 Grown-ups** — 家长中心（算术题解锁）：进度统计、每周教学指引（句型/亲子活动/儿歌/绘本）、每日学习量与语速设置、**星星奖励目标**（设置奖励名称与所需星星，孩子攒满后找家长兑换）、进度 JSON 导出/导入

内置第一阶段 24 周完整数据（约 190 个词项，来自 `english-learning-plan.md`）。

## 语音与跟读（讯飞开放平台）

英文/中文朗读优先用浏览器内置语音，安卓上引擎缺失时自动降级到在线语音。跟读评分与部分中文朗读走讯飞开放平台，浏览器 WebSocket 直连，**无需自建后端**。

### 开通步骤

1. 注册并登录 [讯飞开放平台](https://www.xfyun.cn/)（免费）
2. 控制台 → 我的应用 → 创建新应用，记下 **AppID**
3. 在该应用下开通「语音评测（流式版）」与「在线语音合成（流式版）」，获取 **APIKey** 和 **APISecret**
4. 编辑 `assets/xfyun-config.js`，填入三个凭证（`passScore` 为读对门槛，默认 30 分）

免费额度：每类每天 500 次，日常学习绰绰有余。未配置时跟读按钮自动隐藏，其他功能不受影响。

### 中文朗读通道

学习卡片「中」按钮朗读中文，自动按顺序选择：系统中文语音 → 讯飞在线合成（任意文本）→ 有道词典发音（兜底，仅约 40% 词条）。

> 安全提示：本项目为家庭自用的公开仓库，讯飞密钥直接写在 `xfyun-config.js` 里、随代码公开。若担心额度被盗刷，请在讯飞控制台限制额度或改用私有部署。

## 部署（GitHub Pages 自动部署）

跟读评分需要麦克风权限，手机浏览器只在 **HTTPS** 页面下弹授权框（本地 `file://` 和局域网 `http://IP:端口` 都不行）。本项目用 GitHub Pages 免费托管，地址固定不过期。

### 自动部署机制

`.github/workflows/deploy.yml` 已配置：**每次 push 到 `main` 分支自动构建部署**，只发布 `index.html + assets`，`english-learning-plan.md` 与 `sound-picker.html` 不会上线。

### 首次启用（一次性，在 GitHub 网页操作）

1. 仓库需为 **Public**（私有仓库的 Pages 需付费）
2. 打开仓库 **Settings → Pages**
3. **Build and deployment → Source** 选择 **`GitHub Actions`**
4. 完成后，之前/之后的每次 push 都会自动部署

部署进度见仓库 **Actions** 页（绿勾=成功）。固定地址：`https://<用户名>.github.io/an-english/`。

## 在电脑上使用

双击 `index.html` 即可（Safari / Chrome / Edge 均可）。跟读需麦克风，请用上面的 HTTPS 地址。

## 在手机上使用

用 HTTPS 线上地址访问（跟读功能唯一可用方式）。局域网 `http://IP` 与文件直传方式下朗读、游戏正常，仅跟读不可用。

> 学习进度保存在浏览器 localStorage 且与访问域名绑定：**换地址 = 进度清零**。换设备前先在 Grown-ups → Data 导出 JSON 备份。

## 文件结构

```
an-english/
├── index.html                 # 入口
├── assets/
│   ├── data.js                # 学习内容数据（第一阶段 24 周）
│   ├── core.js                # 状态存储 / 语音合成 / 音效
│   ├── xfyun-config.js        # 讯飞密钥与跟读门槛
│   ├── speech.js              # 跟读评测 + 讯飞语音合成
│   ├── views.js               # 首页 / 单词本 / 家长中心
│   ├── learn.js               # 闪卡与小游戏
│   ├── app.js                 # 启动入口
│   └── style.css              # 样式（移动端优先）
├── sound-picker.html          # 音效试听页（不部署）
├── .github/workflows/deploy.yml  # GitHub Pages 自动部署
├── english-learning-plan.md   # 原始培养计划文档（不部署）
└── README.md
```

## 修改内容数据

编辑 `assets/data.js`，按周调整单词、句型、儿歌、绘本即可。单词配图优先用系统 emoji；没有合适 emoji 的词可留空（自动显示首字母彩色卡片），或用 `art` 字段指定 `core.js` 里的手绘插画。
