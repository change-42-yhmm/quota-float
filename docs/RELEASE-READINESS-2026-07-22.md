# Quota Float v0.2.4 发布前记录

更新时间：2026-07-22（Asia/Shanghai）

## 当前状态

- 用户已确认 `v0.2.4` Windows/macOS 测试包可用。
- GitHub Release `v0.2.4` 保持为草稿，未经用户明确指示不得公开发布。
- 发布标签指向提交 `d3972fc64600a5bd2c7b6d3d2e071d36b7f37c5d`。
- Windows 与 macOS Universal GitHub Actions 均已成功。
- 草稿产物 SHA-256、版本信息以及解包后的隐私/签发材料扫描均已通过。
- `Designer @Change` 是允许出现在用户界面的公开设计师标识。
- 用户已接受本版本不做 Windows Authenticode 签名和 Apple 公证；公开发布说明必须明确 SmartScreen/Gatekeeper 可能出现安全提示。

## 已完成的安全与隔离检查

- 用户包只包含根应用，不包含 `tools/license-cli` 或 `tools/maintainer-issuer`。
- 用户包不包含私钥、测试密钥、测试许可证、签发台账、买家/订单数据、`.work-feedback` 或维护者本机路径。
- 根用户前端残留的签发器 CSS 已删除。
- 正式用户包只注入 Ed25519 公钥；私钥仅保存在维护者受控环境。
- 启动、状态查询和皮肤选择均以已验签许可证为准，伪造偏好字段不能解锁其他皮肤。
- Release 工作流会校验标签版本，并要求许可证公钥为有效的 32 字节 Base64。

## 正式公开发布前仍需完成

1. 在最终下载的 Windows 和 macOS 包上分别完成一次正式许可证端到端验收：Blur、Computer、重启保留、篡改拒绝、跨设备拒绝。
2. 确认 GitHub Secret 中使用的是正式公钥而不是历史本地测试公钥；工作流只能校验格式，不能辨别密钥身份。
3. 在真实 Mac 上确认 Gatekeeper 提示、启动、托盘、透明窗口、展开/收起和两种支持者皮肤。
4. 在 Windows 上确认 SmartScreen 提示、安装/卸载、托盘、自动启动、100%/125%/150% 缩放和两种支持者皮肤。
5. 人工校对草稿 Release 的更新说明，加入 SmartScreen/Gatekeeper 安装提示，并避免把仅供维护者使用的签发器功能描述成用户包功能。
6. 记录最终验收人、时间、Windows EXE/MSI 与 macOS DMG 的 SHA-256，再等待用户明确指示后手动公开发布。

## v0.2.4 草稿产物哈希

- `Quota.Float_0.2.4_x64-setup.exe`: `3308ECB2691216729097C982D19EAD818C65CBF0764179420BBF6B2237C9465D`
- `Quota.Float_0.2.4_x64_en-US.msi`: `B81A14ABDA043120BD1DF7793488082F1CE72204CDD78AACD4BE16BB0139B226`
- `Quota.Float_0.2.4_universal.dmg`: `8596DCE9FDA25CC88FB02A93C34589A966C6FA1C3D13AB3C4149DBBA5246F7B5`
- `Quota.Float_universal.app.tar.gz`: `0782DF96DE8CD24C17388A19190374C7B80128CFFB09DFDE21D4C1E1C526D4CD`

## 2026-07-22 草稿之后的本地维护者工具修改

- 维护者签发器的“复制许可证 JSON”按钮增加成功提示、失败提示和短暂视觉反馈。
- 此修改位于独立的 `tools/maintainer-issuer` 工程，不进入已生成的 `v0.2.4` 用户包，也不要求重打 Windows/macOS 用户测试包。
- 如果未来要交付新版维护者签发器，需要单独构建和测试该工具；不得移动 `v0.2.4` 标签。
