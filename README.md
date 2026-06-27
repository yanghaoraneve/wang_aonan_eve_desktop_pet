# 桌宠小楠

桌宠小楠是一款以王澳楠 EVE 为灵感制作的 Q 版桌面宠物应用。项目包含完整的桌宠程序、三套可切换装扮资源、聊天 Agent、长期记忆、日程提醒和本地歌词知识库。

## 功能特点

- **Q 版桌宠形象**：透明桌面窗口，支持待机、挥手、跳跃、跑动、思考、委屈等多种动画状态。
- **三套装扮切换**：内置红白裙、黑色皮革发带、竹笛棕色造型三套完整动画资源。
- **聊天 Agent**：支持 OpenAI 兼容接口，可配置 DeepSeek 等模型服务。
- **本地记忆系统**：自动提取长期偏好和稳定信息，在后续聊天中作为上下文使用。
- **歌词知识库**：内置王澳楠 EVE 歌词资料，聊天时可作为本地知识来源。
- **日程与提醒**：聊天中可创建提醒，提醒触发时会通过桌宠弹窗提示。
- **桌面小聊**：可在桌宠附近开启轻量聊天输入框，最新回复可显示在桌宠气泡里。
- **GitHub Actions 构建**：推送到 `main` 后可自动构建 macOS 和 Windows 安装包。

## 项目结构

```text
.
├── app/                         # Tauri 2 桌宠应用源码
│   ├── src/                     # 前端、聊天、桌宠渲染和 UI
│   ├── src-tauri/               # Rust 后端、托盘、窗口、SQLite、设置等
│   └── public/assets/           # 运行时桌宠资源、装扮、头像、歌词库
├── codex-pet/                   # Codex 桌宠资源包
├── dressup-assets/              # 换装资源与动画图集
├── qa/                          # 动画预览、校验结果、联系表
└── .github/workflows/           # 自动构建工作流
```

## 本地运行

需要先安装：

- Node.js 18 或更高版本
- Rust stable 工具链
- macOS：Xcode Command Line Tools
- Windows：WebView2 Runtime

启动开发版：

```bash
cd app
npm install
npm run tauri:dev
```

## 本地打包

```bash
cd app
npm install
npm run tauri:build
```

构建产物位置：

- macOS：`app/src-tauri/target/release/bundle/dmg/`
- Windows：`app/src-tauri/target/release/bundle/msi/` 或 `app/src-tauri/target/release/bundle/nsis/`

本地 macOS 未公证安装包首次打开时可能会提示无法验证开发者，可在系统设置中允许打开，或右键选择打开。

## 自动构建

仓库内置 GitHub Actions：

- `Build`：推送到 `main`、提交 PR 或手动触发时，自动构建 macOS 和 Windows 安装包。
- `Release`：推送 `v*` 标签或手动触发时，自动生成 GitHub Release。

构建完成后可在 Actions 的 artifact 中下载：

- `desktop-xiaonan-macos`
- `desktop-xiaonan-windows`

## 使用说明

1. 启动程序后，桌面会出现透明桌宠窗口。
2. 右键桌宠可打开聊天、设置、换装和动作菜单。
3. 在设置中填入模型服务地址、模型名和 API Key。
4. 聊天窗口中可与小楠对话、创建提醒、查看日程。
5. 切换装扮后，桌宠会加载对应动画图集。

## 资源说明

- `app/public/assets/outfits/`：运行时使用的三套完整动画装扮。
- `app/public/assets/skins/`：静态换装预览资源。
- `app/public/assets/eve-knowledge/`：本地歌词知识库。
- `app/public/assets/ui/xiaonan-avatar.png`：聊天头像。
- `dressup-assets/animated/`：原始换装动画资源。
- `qa/previews/`：各状态动画 GIF 预览。

## 说明

本项目为个人桌宠项目，资源和形象用于本地学习、研究和展示。若继续分发安装包，请自行确认相关素材、肖像和音乐资料的使用授权。
