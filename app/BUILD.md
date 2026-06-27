# 构建说明

## 本地环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | 18+ |
| Rust | stable（via rustup） |
| Windows | WebView2 Runtime |
| macOS | Xcode CLT |

## 快速开始

```bash
cd app
npm install
npm run tauri:dev    # 开发
npm run tauri:build  # 发布构建
```

## 体积目标

| 组件 | 大小（约） |
|------|-----------|
| 前端 JS/CSS（gzip） | ~15 KB |
| 运行时资源（webp + 4 PNG + json） | ~3.5 MB |
| Tauri 二进制（Release） | 8–15 MB |
| **安装包合计** | **< 20 MB**（不含 WebView 运行时） |

运行体积检查：

```powershell
cd app
npm run build
powershell -File scripts/measure-bundle.ps1
```

## 跨平台 CI

推送至 `main` 后，GitHub Actions 会在 Windows 与 macOS 上自动构建，产物见 Actions Artifacts。

## 常见问题

### Rust 安装失败（磁盘空间不足）

确保系统盘有至少 **2 GB** 可用空间，然后：

```powershell
rustup default stable
```

### API Key

在「设置」页填写 OpenAI 兼容 API Key，密钥存入系统密钥链（Windows Credential Manager / macOS Keychain），不会写入配置文件。

### 静态皮肤模式

换装 PNG 与精灵图动画造型可能不完全一致。开启「静态皮肤模式」可显示完整皮肤 PNG；关闭则使用 spritesheet 动画（默认红发白裙造型）。
