# An English 🐥

把《幼儿英语培养计划》变成孩子能自己点着玩的互动教材。零依赖、纯本地、离线可用。

## 功能

- **🏠 Today** — 每日任务：本周主题、学新词、玩游戏，星星与连续打卡激励
- **📖 Learn** — 每日闪卡：新词 + 弱词复习自动混排，点击听发音，学完撒花加星；中文释义旁有 **「中」按钮**可朗读中文；**🎤 跟读评分**：听完后点「Read after me」大声跟读，讯飞云端评测发音，读对播放活泼提示音并解锁下一个词（需配置，见下文）
- **🎮 Play** — 听音选图（听力辨音）、翻牌配对（复习巩固）两个小游戏
- **📚 My Words** — 单词本：按周分组，掌握度星级，点卡片随时复习发音
- **🔒 Grown-ups** — 家长中心（算术题解锁）：进度统计、每周教学指引（句型/亲子活动/儿歌/绘本）、每日学习量与语速设置、**星星奖励目标**（设置奖励名称与所需星星，孩子攒满后找家长兑换）、进度 JSON 导出/导入

内置第一阶段 24 周完整数据（约 190 个词项，来自 `english-learning-plan.md`）。

## 跟读功能（可选）

学习页的「读对才能下一个」跟读评分基于讯飞开放平台「语音评测（流式版）」，浏览器 WebSocket 直连，**无需自建后端**。

### 开通步骤

1. 注册并登录 [讯飞开放平台](https://www.xfyun.cn/)（免费）
2. 控制台 → 我的应用 → 创建新应用，记下 **AppID**
3. 在该应用下开通「语音评测（流式版）」服务量，获取 **APIKey** 和 **APISecret**
4. 编辑 `assets/xfyun-config.js`，填入三个凭证（`passScore` 可调整读对门槛，默认 60 分）

免费额度：每天 500 次评测，日常学习绰绰有余。

### 中文朗读（推荐一并开通）

学习卡片上的「中」按钮朗读中文释义，自动按以下顺序选择通道：

1. **系统语音**（speechSynthesis 的中文引擎，多数安卓手机自带）
2. **讯飞在线语音合成（流式版）**——覆盖任意文本、音色自然。需在**同一个应用**下额外开通该服务（免费 500 次/天），复用跟读评分的密钥
3. **有道词典发音**——最后兜底，仅覆盖约 40% 的词条，部分词会无声

未开通讯飞合成时功能仍可用（走 1 → 3），只是部分安卓设备上覆盖率打折。

### 注意

- 跟读需要麦克风权限：**手机必须在 HTTPS 地址下访问**（本地 `file://` 和局域网 `http://IP:端口` 都无法授权麦克风，朗读等功能不受影响）。推荐托管到任意免费静态托管（EdgeOne Pages / GitHub Pages 等），电脑上 Chrome/Edge 直接打开通常可测。
- 未配置密钥时跟读按钮自动隐藏，学习流程完全不受影响。
- 密钥写在纯前端仅供家庭自用，请勿公开分享托管地址给不信任的人（密钥可能被人提取、消耗免费额度）。

## 在电脑上使用

双击 `index.html` 即可（Safari / Chrome / Edge 均可）。

## 在手机上使用（四选一）

### 方式 A：局域网访问（无需部署）

> 想用跟读评分请直接看方式 D；方式 A/B/C 下朗读、游戏均正常，仅跟读不可用。

在电脑上进入本目录，启动一个静态服务：

```bash
cd an-english
python3 -m http.server 8000
```

手机与电脑连同一个 Wi-Fi，手机浏览器访问：

```
http://<电脑IP>:8000
```

电脑 IP 查询：Mac「系统设置 → Wi-Fi → 详细信息」，或执行 `ipconfig getifaddr en0`。

> 注意：进度保存在浏览器里且与地址绑定。固定用同一个地址（同一端口）访问，进度才会延续。

### 方式 B：文件直传

把整个 `an-english` 文件夹发到手机（隔空投送 / 微信文件传输助手等）：

- **iPhone**：在「文件」App 中找到 `index.html`，长按 →「分享」→「Safari」打开。若语音不出声，请优先使用方式 A。
- **Android**：用 Chrome 打开 `file:///sdcard/Download/an-english/index.html`。

### 方式 C：加到主屏幕

用方式 A 打开后，Safari「分享 → 添加到主屏幕」，之后像 App 一样全屏使用。

### 方式 D：线上托管地址（跟读功能唯一可用的方式）

按下一节「部署到线上」拿到 HTTPS 地址后，手机直接访问。麦克风授权只在 HTTPS 下可用，因此方式 A/B/C 下跟读按钮会自动隐藏或降级。

## 部署到线上（HTTPS 托管）

跟读评分需要麦克风权限，手机浏览器只在 **HTTPS** 页面下弹授权框（本地 `file://` 和局域网 `http://IP:端口` 都不行，朗读等其他功能不受影响）。本项目用 **Cloudflare Pages** 托管：免费、支持私有仓库、地址固定不过期，每次 `git push` 自动部署。

### 为什么不用 GitHub Pages

GitHub Pages 对**私有仓库需付费**。本仓库的 `assets/xfyun-config.js` 含讯飞密钥不能公开，因此选用对私有仓库免费的 Cloudflare Pages。

### 首次配置（一次性，在 Cloudflare 网页完成）

1. 注册并登录 [Cloudflare](https://dash.cloudflare.com/)（免费）
2. 左侧 **Workers & Pages → Create → Pages → Connect to Git**
3. 授权并选择本仓库 `an-english`，分支选 `main`
4. 构建设置：
   - **Framework preset**：`None`
   - **Build command**：`sh build.sh`
   - **Build output directory**：`dist`
5. 点 **Save and Deploy**，等首次构建完成即可拿到固定地址 `https://<项目名>.pages.dev`

之后无需任何手动操作：**每次 push 到 main，Cloudflare 自动重新构建部署**，地址不变、不过期。

### 部署范围（由 build.sh 控制）

`build.sh` 只把 `index.html + assets` 收集到 `dist/`，`english-learning-plan.md`（含个人规划）、`sound-picker.html`（音效试听页）不会上线。

### 重要提示

- **保持仓库 Private**：`xfyun-config.js` 的密钥会随代码进仓库，纯静态托管下也会暴露在浏览器里（这类方案的固有特性），仅供家庭自用
- 不要把 `*.pages.dev` 地址公开分享给不信任的人，避免密钥被提取消耗免费额度
- 学习进度保存在浏览器 localStorage 且与访问域名绑定：**换地址 = 进度清零**。换地址或换设备前，先在 Grown-ups → Data 导出 JSON 备份

### 备用：EdgeOne Pages 手动部署

不想用 Cloudflare 时，也可让 CodeBuddy 「帮我部署到 EdgeOne Pages」手动上传，但拿到的是约 **3 小时过期**的预览链接，不适合长期使用。

## 数据与备份

- 学习进度（星星、打卡、单词掌握度、设置）保存在浏览器 `localStorage`。
- 清理浏览器数据、更换设备前，请先在 **Grown-ups → Data** 里导出 JSON 备份，再用「导入」恢复。

## 文件结构

```
an-english/
├── index.html          # 入口
├── assets/
│   ├── data.js         # 学习内容数据（第一阶段 24 周）
│   ├── core.js         # 状态存储 / 语音合成 / 音效
│   ├── xfyun-config.js # 跟读评分密钥配置（讯飞开放平台）
│   ├── speech.js       # 跟读模块（麦克风采集 + 讯飞评测）
│   ├── views.js        # 首页 / 单词本 / 家长中心
│   ├── learn.js        # 闪卡与小游戏
│   ├── app.js          # 启动入口
│   └── style.css       # 样式（移动端优先）
├── english-learning-plan.md   # 原始培养计划文档
└── README.md
```

## 修改内容数据

编辑 `assets/data.js`，按周调整单词、句型、儿歌、绘本即可。单词配图优先用系统 emoji；没有合适 emoji 的词可留空（自动显示首字母彩色卡片）。
