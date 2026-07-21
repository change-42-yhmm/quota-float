# 2026-07-18 交接：Blur 与许可证签发器

## 已完成

- 托盘“主题”下新增“支持者皮肤”子菜单，当前显示 `Blur`；选中后使用勾选状态表示。
- 一级入口改为“赞赏开发者（皮肤）”。
- Blur 展开卡的大数字向上微调；周额度数字及 `%` 统一为 Nunito Medium（500）。
- 新增维护者本地“许可证签发器”窗口：输入 `QF1-...` 设备码、临时粘贴或导入 Base64 私钥、生成并复制 Blur 许可证 JSON。
- 私钥只用于当前一次签名，不写入应用设置、偏好或许可证 JSON。

## 本机测试

本次联调用的是 `tools/license-cli/local-test/` 下的测试密钥。该目录已被 `.gitignore` 忽略，绝不能提交或分发。

启动客户端和签发器（PowerShell）：

```powershell
$env:QUOTA_FLOAT_ISSUER = "1"
$env:QUOTA_FLOAT_LICENSE_PUBLIC_KEY = Get-Content -Raw ".\tools\license-cli\local-test\public-key.txt"
npm.cmd run tauri dev
```

签发器窗口使用 `private.key` 生成许可证；同一测试目录的 `public-key.txt` 必须在客户端构建时注入，客户端才能验证这张测试许可证。

## 正式发布前

1. 在离线维护者电脑重新生成一套正式 Ed25519 密钥。
2. 私钥离线加密保存，仅维护者签发器使用；不要放进仓库、安装包或聊天记录。
3. 将正式公钥作为 `QUOTA_FLOAT_LICENSE_PUBLIC_KEY` 注入发布构建。
4. 用一台测试设备完整走一次：复制设备码 → 签发 → 粘贴激活 → 托盘切换 Blur。

## 下次可继续调整

- 签发器的 UI：`src/components/LicenseIssuer.tsx`、`src/styles.css`
- 离线签名逻辑：`src-tauri/src/license.rs`
- Tauri 窗口与启动开关：`src-tauri/tauri.conf.json`、`src-tauri/src/lib.rs`

## 2026-07-20 update

- Supporter popup: restored `assets/supporter-background.svg` as the top background layer; the white panel color remains underneath it.
- Supporter window: set to 520 x 960, with a minimum height of 820, so the authorization and use notice is visible without clipping.
- Supporter popup: added the supplied `assets/点赞.svg` as a short success-only animation after a license is verified. It pops above the verification button, rises, then fades out; it respects reduced-motion preferences.
- Blur skin states: refreshed healthy, caution, and critical images from `效果/`; added mappings for `blur-unavailable.png` and `blur-signedout.png`. States without a supplied image keep the prior fallback appearance.
- Dev environment: Quota Float desktop tool and the design workbench are currently started. The workbench URL is `http://localhost:1421/?design=1`.

### Next task

Adjust the Blur progress-bar colours. Relevant rules are `.blur-progress`, `.blur-progress i.is-available`, and `.blur-progress i.is-used` in `src/styles.css`.

## 2026-07-21 v0.2.1 验收后交接

- **支持者页首次弹出**：实机首次验证时仍出现了支持者页。产品决定当前保留，不再修改首次弹出逻辑；后续不得把它当作本轮回归缺陷。
- **托盘默认皮肤菜单**：默认皮肤子菜单必须且只包含“跟随系统 / 浅色 / 深色”三个互斥状态。选择任一项会立即应用相应外观并恢复默认免费皮肤；不再显示单独的“使用默认皮肤”菜单项。
- **桌面灰边 / 阴影**：展开深色卡和收起浅色球四周出现灰色，不是设计台与桌面 CSS 不一致的单一透明度问题。当前 `.quota-card, .loading-card` 有浅色外投影 `0 1px 8px rgba(90,108,132,.05)`，`.quota-card--theme-dark` 有深色外投影 `0 8px 28px rgba(0,0,0,.26)`；同时原生窗口为容纳投影保留 `4px` 安全边距。设计台外框设置 `box-shadow: none` 且背景不同，因此灰雾不显著。后续需单独确定“保留投影”或“移除外投影并重新处理安全边距”，未经实机验证不要再次仅把安全边距改为 0px。
