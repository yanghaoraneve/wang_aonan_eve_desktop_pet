# 桌宠小楠应用源码

这里是桌宠小楠的 Tauri 2 应用源码，前端使用 TypeScript + Preact，桌面能力由 Rust/Tauri 提供。

## 开发环境

- Node.js 18+
- Rust stable
- macOS：Xcode Command Line Tools
- Windows：WebView2 Runtime

## 安装依赖

```bash
npm install
```

## 开发运行

```bash
npm run tauri:dev
```

## 生产构建

```bash
npm run tauri:build
```

构建输出：

- macOS：`src-tauri/target/release/bundle/dmg/`
- Windows：`src-tauri/target/release/bundle/msi/` 或 `src-tauri/target/release/bundle/nsis/`

## 主要目录

```text
src/pet/              # Canvas 桌宠渲染、状态机、动画逻辑
src/chat/             # 聊天 Agent、模型请求、记忆、日程工具、本地知识库
src/ui/               # 聊天窗口和设置窗口
src/styles/           # 桌宠、聊天、设置样式
src-tauri/            # Rust 后端、托盘、窗口控制、SQLite、设置存储
public/assets/        # 桌宠图集、换装资源、头像、歌词知识库
```

## 常用脚本

```bash
npm run build         # TypeScript 检查并构建前端
npm run tauri:dev     # 启动 Tauri 开发版
npm run tauri:build   # 构建桌面安装包
```

## 配置说明

模型服务配置保存在应用设置中。API Key 会写入本机应用配置文件，不再反复请求钥匙串权限。聊天 Agent 默认使用项目内置的王澳楠 EVE skill prompt，并会读取本地歌词知识库作为补充上下文。
