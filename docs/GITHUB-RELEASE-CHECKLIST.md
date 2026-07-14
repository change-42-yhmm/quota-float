# GitHub 发布与分享清单

## 需要提前安装或准备什么

本机 Windows 不需要安装 macOS 构建工具，也不能直接构建 macOS 安装包。macOS 包由 GitHub Actions 的 `macos-latest` runner 构建。

本机需要：

- Git
- Node.js 20+
- Rust stable
- npm 依赖已安装

GitHub 需要：

- 一个 GitHub 仓库
- GitHub Actions 已启用
- 代码已推送到默认分支

macOS Universal 构建需要的 Rust targets 已经在 CI/release workflow 中自动安装：

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

你不需要在 Windows 本机安装这两个 target。

## 第一次上传到 GitHub

如果本地仓库还没有 remote，先在 GitHub 创建一个空仓库，然后执行：

```bash
git remote add origin https://github.com/<owner>/<repo>.git
git branch -M main
git add .
git commit -m "Prepare Windows and macOS unsigned release"
git push -u origin main
```

如果已经有 remote，只需要：

```bash
git add .
git commit -m "Prepare Windows and macOS unsigned release"
git push origin main
```

## 生成可分享版本

推送 `v*` tag 会触发 release workflow：

```bash
git tag v0.1.8
git push origin v0.1.8
```

Windows 与 macOS 均构建、检查成功后，工作流才会创建一个 draft release。附件应包含：

- `quota-float-windows-unsigned.zip`
- `quota-float-macos-universal-unsigned.zip`
- `SHA256SUMS.txt`

先核对 SHA-256、版本、隐私扫描，以及两个平台的安装和启动结果。确认无误后才点击 Publish release，然后把 Release 链接发给用户。

## 发给 Mac 用户时的说明

当前 macOS 包是 unsigned 包。用户首次打开可能会被 Gatekeeper 拦截，可以这样打开：

1. 下载 `quota-float-macos-universal-unsigned.zip`。
2. 解压后把应用拖到 Applications 或任意测试目录。
3. 右键点击应用，选择 Open。
4. 在系统提示里再次选择 Open。
5. 如果仍被拦截，到 System Settings -> Privacy & Security 里允许打开。

## 以后公开分发还需要什么

如果要面向非技术用户公开分发，建议补：

- Windows 代码签名证书。
- Apple Developer ID Application 证书。
- Apple Team ID。
- Apple app-specific password。
- GitHub Secrets 中的签名和公证配置。

这些账号、证书和密码不能由代码生成，需要项目所有者申请或购买。
