# 测试矩阵

| 范围 | 场景 | 预期 | 状态 |
| --- | --- | --- | --- |
| 数据 | Codex 正常登录 | 显示真实 5 小时窗口、周窗口与会员类型 | 待 Windows/macOS 桌面环境验证 |
| 数据 | 未登录或登录过期 | 显示登录提示，不暴露响应或 token | 待 Windows/macOS 桌面环境验证 |
| 数据 | 401/403/429/断网 | 安全错误文案、保留旧数据并退避 | 快照合并单元测试通过，待桌面集成验证 |
| 数据 | 变形或缺字段响应 | 不崩溃，不显示虚假额度 | 解析器单元测试覆盖，待集成验证 |
| 登录态 | Windows `CODEX_HOME` 或用户目录 `.codex/auth.json` | 可以读取本机 Codex 登录态 | 待 Windows 实机验证 |
| 登录态 | macOS `CODEX_HOME` 或 `~/.codex/auth.json` | 可以读取本机 Codex 登录态 | 待 macOS 实机验证 |
| 窗口 | 拖动、锁定、鼠标穿透 | 锁定后不拦截编辑器输入，托盘可解锁 | 待 Windows/macOS 验证 |
| 窗口 | 多显示器、缩放、移除显示器 | 恢复到可见工作区 | 依赖 window-state 插件，待实机验证 |
| 托盘 | Windows 托盘菜单 | 面板显示设置可持久保存；隐藏后可由托盘图标恢复；刷新、解锁、语言切换、开机启动、退出可用 | 待 Windows 实机验证 |
| 菜单栏 | macOS 菜单栏托盘 | 面板显示设置可持久保存；隐藏后可由菜单栏图标恢复；刷新、解锁、语言切换、开机启动、退出可用 | 待 macOS 实机验证 |
| 视觉 | 悬浮球和展开卡片 | Windows/macOS 使用同一 CSS 参数，尺寸、透明度、圆角、文字布局保持一致 | 待双平台截图验收 |
| 生命周期 | 单实例、关闭隐藏、休眠恢复 | 无重复后台进程，窗口可恢复 | 待实机验证 |
| 性能 | 空闲 CPU/内存 | 无持续高 CPU，记录平台基线 | 待安装包验证 |
| 构建 | Windows unsigned 包 | 生成 `quota-float-windows-unsigned.zip` | CI/Release 验证 |
| 构建 | macOS Universal unsigned 包 | 生成 `quota-float-macos-universal-unsigned.zip`，支持 Apple Silicon 和 Intel | CI/Release 验证 |
| 隐私 | 日志与配置扫描 | 无 token、账号 ID、原始响应 | 静态审查通过，待安装包扫描 |

## 发布门槛

发布前应满足：

- 前端测试、前端构建、Rust 测试通过。
- Windows 和 macOS CI bundle artifact 成功生成。
- Windows 实机完成安装、启动、托盘、拖动、锁定、语言切换、退出验证。
- macOS 实机完成首次打开、菜单栏托盘、透明悬浮窗、展开/收起、拖动、置顶、读取 `~/.codex/auth.json` 验证。
- 严重和高风险问题清零。
