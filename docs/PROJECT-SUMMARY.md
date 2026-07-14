# Quota Float 项目简介

## 一句话定位

Quota Float 是一个 Tauri 2 桌面悬浮窗，用本机 Codex Desktop 登录态只读查询 Codex 额度，并以小卡片展示 5 小时额度、每周额度、重置时间、重置机会和会员类型。

## 当前技术栈

- 前端：React 19、TypeScript、Vite、Phosphor Icons。
- 桌面壳：Tauri 2、Rust。
- 网络：Rust `reqwest` 调用 ChatGPT 后端只读额度接口。
- 测试：Vitest 覆盖前端格式化与快照合并逻辑；Rust 覆盖 Codex 响应解析逻辑。

## 主要功能

- 悬浮额度卡片：展示 Codex 5 小时窗口剩余额度、周额度、重置时间和重置机会。
- 桌面行为：无边框、透明、置顶、不可手动拖动；Windows 跟随 ChatGPT 宿主固定定位；可锁定鼠标穿透，并可从托盘显示/隐藏/刷新/解锁/退出。
- 跨平台构建：同一套前端 UI/动效代码输出 Windows unsigned 包和 macOS Universal unsigned 包。
- 状态兜底：接口失败时保留上次成功数据并标记 stale；登录失效、限流、接口变形会给安全提示。
- 偏好保存：锁定状态、置顶状态、固定 provider、轮播间隔、语言写入 Tauri app config 目录，带 `.bak` 备份恢复。
- 预留扩展：类型层已有 `codex | claude` provider 结构，但当前只启用 Codex。

## 关键文件

- `src/App.tsx`：前端状态机，负责刷新、退避、stale 处理、消费中提示、轮播与偏好保存。
- `src/components/QuotaCard.tsx`：悬浮球、展开卡片 UI 与交互按钮。
- `src/lib/bridge.ts`：浏览器 mock 与 Tauri command 桥接。
- `src/lib/format.ts`：额度百分比、健康档位、重置时间格式化、快刷新判断。
- `src/lib/snapshots.ts`：新旧 snapshot 合并与失败保留旧数据逻辑。
- `src-tauri/src/codex.rs`：读取本地 Codex auth、拼接请求头、调用额度与 reset credits 接口、解析响应。
- `src-tauri/src/lib.rs`：Tauri command、缓存锁、偏好持久化、托盘、窗口状态、锁定穿透。
- `.github/workflows/release.yml`：生成 Windows unsigned 和 macOS Universal unsigned 发布包。

## 数据与安全边界

- 只读取本机 Codex 登录文件，默认路径来自 `CODEX_HOME` 或用户目录 `.codex/auth.json`。
- 不复制 token，不上传 token 到第三方，不记录原始接口响应。
- 请求头里的 token 与账号 ID 视为敏感信息。
- 接口响应限制为 1 MB，auth 文件限制为 256 KB。
- 不兑换重置机会，不修改账号设置。
- Codex 额度接口不是公开稳定 API。字段或认证变化时应显示不可用，不应猜测额度。

## 运行与验证

```bash
npm install
npm run dev
npm run test
npm run build
npm run tauri dev
```

浏览器 `npm run dev` 使用 mock 数据；真实额度读取只能在 Tauri 桌面环境中验证。

## 维护重点

- 用真实 Codex Desktop 登录态做 Tauri 集成验证，尤其是登录过期、401/403/429、断网、响应字段变化。
- 确认悬浮窗锁定穿透、托盘/菜单栏解锁、多显示器恢复、开机启动在 Windows/macOS 的实机行为。
- 后续视觉调整默认只改共享 React/CSS，不维护 Windows/macOS 两套 UI。
- 若启用 Claude provider，先补 provider adapter、类型收敛、轮播/固定逻辑和失败隔离测试。
- 发布前补齐签名、公证、安装包扫描和日志隐私审计。
