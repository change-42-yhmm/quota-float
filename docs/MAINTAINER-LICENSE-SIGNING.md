# 维护者离线许可证签发：迁移与使用

本文面向开发者本人使用的另一台受控电脑。它不是给用户安装的内容。

## 先分清三个角色

| 角色 | 需要什么 | 是否可交给用户 |
| --- | --- | --- |
| 用户正式应用 | 已内置公钥，自动验证许可证 JSON | 可以分发 |
| 维护者签发电脑 | 离线签发工具 + 私钥 | 不可以分发 |
| 用户 | 自己设备显示的 `QF1-...` 设备码与收到的许可证 JSON | 不可获得私钥 |

正式用户包没有签发器，也不需要安装单独“验证器”。另一台开发者电脑需要的是**维护者签发工具**，用于按用户的设备码生成许可证。

## 推荐迁移方式：复制可执行签发工具

在当前维护者电脑构建一次后，将以下两个文件复制到另一台受控维护者电脑的加密目录，例如 `D:\QuotaFloat-Maintainer\`：

| 必须复制 | 当前来源 | 用途 | 安全级别 |
| --- | --- | --- |
| `quota-float-license-cli.exe` | `tools\license-cli\target\release\quota-float-license-cli.exe` | 生成许可证 JSON | 可仅限维护者保存 |
| `supporter-v1.private.key` | `%LOCALAPPDATA%\Quota Float\maintainer-keys\supporter-v1.private.key` | Ed25519 签名私钥 | **绝密；绝不上传、提交、发给用户或粘贴进聊天** |

可选备份（不参与日常签发）：

| 可选文件 | 当前来源 | 用途 |
| --- | --- | --- |
| `supporter-v1.public.key` | `%LOCALAPPDATA%\Quota Float\maintainer-keys\supporter-v1.public.key` | 恢复 GitHub Actions 公钥 Secret 或核对密钥对 |

不要复制或分发：整个项目仓库、`tools\license-cli\local-test\`、任何 `target\` 编译缓存、旧测试密钥、用户许可证 JSON、订单台账或用户原始设备信息。

建议通过加密 U 盘或密码管理器附件转移私钥；目标电脑应启用磁盘加密，并限制为维护者个人账户可访问。

## 如果需要在另一台电脑重新构建

目标电脑安装 Rust stable 后，只复制 `tools\license-cli\` 的源码内容（`Cargo.toml`、`Cargo.lock`、`README.md`、`src\`），不复制 `target\`、`local-test\` 或任何密钥。然后运行：

```powershell
cargo build --release --manifest-path .\tools\license-cli\Cargo.toml
```

生成的维护者工具为：

```text
tools\license-cli\target\release\quota-float-license-cli.exe
```

## 给用户签发许可证

1. 用户在正式应用“支持者皮肤”页复制完整的 `QF1-...` 设备码并发给维护者。
2. 维护者在离线签发电脑打开 PowerShell，按所售皮肤运行：

```powershell
.\quota-float-license-cli.exe sign `
  --skin-id blur `
  --device-hash QF1-XXXX-XXXX-XXXX-XXXX `
  --private-key-file D:\QuotaFloat-Maintainer\supporter-v1.private.key
```

Computer 皮肤将 `--skin-id blur` 改为 `--skin-id computer`。

3. 工具输出完整许可证 JSON。仅将该 JSON 发给对应用户；用户粘贴到正式应用后，本地公钥会自动验证签名和设备绑定。
4. 维护者台账只记录设备码前缀与许可证 ID；不要记录完整设备码、私钥或完整许可证 JSON。

## 换机与恢复

- 换电脑：用户重新提供新设备的 `QF1-...`，维护者用同一私钥重新签发。
- 私钥遗失：已发布应用不能信任新私钥签发的许可证；必须轮换新的 `keyId` 并发布支持新公钥的应用版本。
- 私钥疑似泄露：立即停止签发和发布，生成新密钥对，轮换公钥并重新签发受影响许可证。
