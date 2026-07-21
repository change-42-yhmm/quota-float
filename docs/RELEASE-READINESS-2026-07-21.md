# 2026-07-21 正式上线前审查与交接

## 当前决定

**禁止将旧的本地联调包或 `0.1.5` 安装包分发给用户。** 当前正式发布目标为 `v0.2.0`；本文件记录其安全、隐私和交付检查。

当前本机安装的 `%LOCALAPPDATA%\\Quota Float\\quota-float.exe` 是测试用途：它曾注入 `tools/license-cli/local-test/public-key.txt`，不能视为正式版本。

## 对抗性审查结论

### P0：正式发布前必须处理

1. **`效果/` 不能作为生产资源目录。— 已处理，待产物审计。**
   已新建 `assets/blur/`，仅复制 5 个 Blur 状态图和 `按钮bg.png`；CSS 已改为只引用新目录，用户保存的 `效果/` 未改动。打包后仍必须在新建的临时解包目录中确认没有 `效果/`、截图、`付费计划.txt` 或任何用户文件。
2. **正式用户包必须移除签发器。— 已处理，待产物审计。**
   已从正式 Tauri 配置移除 issuer 窗口、前端 issuer 路由、Rust 签名命令和启动参数入口。签发只保留在独立离线 `tools/license-cli`；用户包没有私钥导入或签名能力。
3. **移除 debug 许可证旁路。— 已处理；单元级负向测试已通过，待安装包验收。**
   已删除 `debug_assertions` 下信任 `unlocked_skins` 的旁路。2026-07-21 已通过 Rust 单元测试：伪造 `unlockedSkins`、`selectedSkin` 或许可证字段均不能激活 Blur / Computer；发布验收仍须在最终安装包中重复该负向场景。
4. **建立正式密钥与公钥注入流程。— 已完成，待产物验证。**
   2026-07-21 已在维护者本机、仓库外的受限目录生成新的 Ed25519 密钥对。私钥仅供离线 `tools/license-cli` 导入和签发，绝不进入仓库、CI、安装包、日志或交接文档；公钥已写入 GitHub Actions Secret `QUOTA_FLOAT_LICENSE_PUBLIC_KEY`。Release workflow 会始终创建 draft release，避免未经人工验收的产物自动公开。
5. **Computer 许可证可签发性。— 已处理，待端到端测试。**
   `tools/license-cli` 现在允许 `--skin-id blur|computer`。仍须用正式私钥对两个皮肤分别完成签发与安装包验证。

### P1：隐私与产品决策

- QF1 是 `MachineGuid` / `IOPlatformUUID` 经固定 salt 的 SHA-256 截断值。它不暴露原始硬件 ID，但稳定、可关联同一设备；完整 QF1 与许可证 JSON 目前保存在用户本机 app config，不上传。客服聊天、订单台账、截图和日志不得长期保存完整 QF1/许可证；台账仅保留前缀和许可证 ID。
- 当前 UI 暴露 `Designer @Change`，更新地址暴露 GitHub 帐号/仓库。若“不能暴露制作人任何隐私”包含该身份信息，正式发布前必须移除设计师署名，并改用公开品牌组织帐号、独立发布地址或中性域名。此项需要产品所有者明确决定。
- Tauri 未配置 `bundle.resources` 或 `externalBin`。在移除 CSS 对 `效果/` 的引用后，`效果/`、`tools/`、`local-test/`、私钥、许可证、账本、docs 和日志不会自动进入 Tauri 安装包。仍须以最终产物解包检查为准，不能只依赖 `.gitignore`。

### 防破解的真实边界

Ed25519 验签可阻止伪造许可证 JSON、普通配置篡改及跨设备复制；应用也会在读取状态和选择皮肤时重验。它**不能**让离线内置的 Blur/Computer 素材成为不可破解 DRM：技术用户仍可提取图片/CSS、补丁本地二进制或修改内存。

若产品要求“实质上不能绕过”，必须改为账户体系 + 服务端授权 + 在线校验/授权后资源下载，并接受服务端、隐私告知、可用性和成本；即使如此也不能保证绝对防复制。正式文案应承诺“防伪造许可证和普通配置篡改”，不得承诺“完全不可破解”。

## 正式发布流程（按顺序执行）

### 阶段 0：冻结与清单

1. 不提交、不分发 `效果/`、`tools/license-cli/local-test/`、`*.key`、`*.license.json`、账本、截图、日志或临时目录。
2. 新建仅用于生产的资源目录，将 6 个实际引用的 Blur 资源复制进去；不修改原 `效果/`。
3. 修改 CSS 后运行 `rg "效果/" src assets`，结果必须为空。
4. 选择正式公开身份策略：移除 `@Change` / 更换公开品牌身份 / 确认允许公开。未决定不得正式发布。

### 阶段 1：授权硬化

1. 将签发器从正式用户构建中移除；保留独立维护者 CLI。
2. 移除 debug `unlocked_skins` 旁路，并补充负向测试。
3. 让 CLI 支持 `blur` 和 `computer`，并对两个 skin 的有效、篡改、跨设备和重复激活进行测试。
4. 在隔离维护者机器生成新的正式 Ed25519 密钥对。私钥离线加密备份；只把公钥放入受控 CI secret/变量。

### 阶段 2：受控构建

1. 将已生成的正式公钥写入 GitHub Actions Secret `QUOTA_FLOAT_LICENSE_PUBLIC_KEY`，并确认既有 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 可用。
2. 使用干净工作树/受控构建环境，设置正式 `QUOTA_FLOAT_LICENSE_PUBLIC_KEY`。
3. 构建 release 二进制和 Windows MSI/NSIS；不得用直接覆盖本机 exe 的方式替代正式产物。
4. 在新的临时目录解包 MSI/NSIS；搜索 `效果`、`Snipaste`、`tools`、`local-test`、`private.key`、`.license.json`、账本、真实 QF1 和制作人私密信息，结果必须为空。
5. 检查安装包版本、签名/哈希、更新器元数据和发布资产名称。

### 阶段 3：隔离验收

在至少一台干净 Windows 测试机完成：

1. 正式私钥签发 Blur 与 Computer，分别在正确设备码上激活、托盘切换、重启保留。
2. 篡改 JSON 任一字段/签名、使用其他设备码、使用测试私钥、伪造 preferences 解锁字段，全部必须失败或回退 default。
3. 验证支持者窗口只显示哈希化 QF1；查看 app config、日志和安装目录，确认无原始 MachineGuid、私钥或测试材料。
4. 检查不登录/过期/不可用状态、默认皮肤和两种支持者皮肤的展开/收起表现。

### 阶段 4：发布与回滚

1. CI 先创建 draft release；只有阶段 2/3 记录完整后人工发布，不允许自动公开。
2. 发布前保存产物 SHA-256、版本号、构建公钥 key ID、验收人和时间；不保存私钥、完整设备码或完整许可证。
3. 保留上一正式安装包与更新器 manifest 以便回滚；如果发现公钥/私钥泄露，立即停止发布、轮换新 key ID、重新签发受影响许可证。

## 下次对话起点

先处理阶段 0 和阶段 1 的 P0 项，再执行正式密钥生成与阶段 2。当前“本机测试包”只能用于继续验证交互，不得对外分发。

## 发布执行记录（2026-07-21）

- 正式版本已更新为 `0.2.0`；前端测试 16/16 与 Rust 测试 18/18 均已通过。
- 许可证正式密钥对已在维护者本机的仓库外受限目录生成；公钥已写入 GitHub Actions Secret，私钥未进入仓库、CI 或本文件。
- `v0.2.0` 候选内容已完成本地提交；临时反馈目录、测试材料、私钥和 CLI 编译缓存均已排除。
- GitHub 网络代理已配置；提交和 `v0.2.0` 标签已推送。GitHub Actions 的 Windows 与 macOS Universal 构建均已成功，草稿 Release 已创建且保持未公开。
- Windows EXE/MSI 与 macOS Universal DMG 已下载到本地测试目录，SHA-256 已与草稿 Release 资产核对一致。下一步是维护者实机安装测试：启动、托盘、默认皮肤、Blur/Computer 激活与切换、重启后保留、篡改/跨设备许可证拒绝。
- 实机验收通过后，执行最终产物解包审计、记录哈希与验收时间，再手动公开草稿 Release。

## 维护者签发器拆分决定（2026-07-21）

- **正式用户包**继续不包含 GUI 签发器、私钥导入、签名命令或维护者启动开关；用户端只接收许可证 JSON 并使用内置公钥本地验签。
- **维护者环境**保留独立离线 `tools/license-cli`，并已新增独立 `tools/maintainer-issuer` GUI。二者均与用户包分离，私钥仅保存在维护者受控电脑。
- 旧的本地 `License Issuer` GUI 属于此前开发窗口；其前端路由与 Rust 签名入口已从当前正式代码中移除。残留 CSS 不构成可用或可分发的签发器。
- 已完成单独的 `Quota Float Maintainer Issuer` 维护者 GUI 工具：仅供开发者电脑离线使用，使用本机私钥为 `blur` / `computer` 签发 JSON；它采用独立构建目标和分发边界，绝不进入正式用户安装包。私钥只在单次签名时读取，签发后从界面内存清除。
- 维护者可继续按 [MAINTAINER-LICENSE-SIGNING.md](MAINTAINER-LICENSE-SIGNING.md) 使用 `license-cli`，或构建 `tools/maintainer-issuer` 使用 GUI。
