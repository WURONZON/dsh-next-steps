# 发布流程

[English](RELEASING.md) · **简体中文**

每次发布使用的清单，来自 v0.1.0 到 v0.1.2 的实践。npm 包名是
`@zongcn/dsh-next-steps`；GitHub 仓库、tag 与 Release 保持
`dsh-next-steps`。

## 开始之前

| 要求 | 原因 |
| --- | --- |
| npm token 具备 **Read and write (publish and stage)** 并勾选 **Bypass 2FA** | stage only 的 token 会强制走 staged 发布；没有 bypass 会报 `EOTP` |
| `~/.npm` 缓存可写 | `npm pack` / `npm publish` 遇到 root 属主的缓存文件会报 `EPERM`（`sudo chown -R 501:20 ~/.npm`） |
| 被 tag 的提交里包含 `.github/workflows/ci.yml` | 只有该提交存在 workflow 时，push tag 才会触发 CI |
| 工作区干净 | 发布提交里只应有版本号变更 |

## 清单

1. **改版本号** —— 发布提交里唯一的变化：

   ```sh
   npm version 0.1.3 --no-git-tag-version
   ```

2. **本地验证**：

   ```sh
   npm test              # 33 项宿主检查 + 10 项横条检查
   npm pack --dry-run    # 16 个文件
   ```

3. **提交并推送** —— 触发 `main` 上的 CI：

   ```sh
   git add package.json
   git commit -m 'chore: release 0.1.3'
   git push
   ```

4. **打 tag 并推送** —— 触发 tag 上的 CI：

   ```sh
   git tag -a v0.1.3 -m 'dsh-next-steps 0.1.3' -m '<发布说明>'
   git push origin v0.1.3
   ```

   等两次 Actions 运行都是 `success` 再发布。

5. **发布**：

   ```sh
   npm publish
   ```

   可能的结果：

   - 退出码 0，版本稍后出现在 registry；
   - `EOTP` → 执行 `npm publish --otp=<动态码>`；
   - 返回 `202` / "being processed"，或出现公开的 `0.0.0-stage`
     占位版本 → 版本进入 staged，等待处理或在 Staged Packages 页面批准。

6. **确认 registry**：

   ```sh
   npm view @zongcn/dsh-next-steps version dist-tags   # latest 必须是 0.1.3
   ```

7. **创建 GitHub Release**：

   ```sh
   git tag -l --format='%(contents)' v0.1.3 > /tmp/notes.md
   gh release create v0.1.3 --title 'v0.1.3' --notes-file /tmp/notes.md --latest
   ```

8. **在干净 profile 上验证**：

   ```sh
   DSH_HOME=/tmp/dsh-home-013 dsh plugin --profile web add @zongcn/dsh-next-steps@0.1.3
   DSH_HOME=/tmp/dsh-home-013 dsh --profile web --dump-config
   DSH_HOME=/tmp/dsh-home-013 dsh --profile web --no-open --host 127.0.0.1 --port 6130
   ```

   用服务端打印的 token：

   - `GET /` → 200，boot payload 里列出插件模块；
   - `POST /api/next-steps/state` → `200 {"ok":true, ...}`；
   - 未知路由 → 404。

9. **清理**：

   ```sh
   rm -rf /tmp/dsh-home-013
   ```

   确认没有残留的 `dsh --profile web` 进程，端口已释放。

## 规则与坑

- **不要移动已发布的 tag。** 每一版都新建自己的 tag；对 tag 做 force push
  会让已有的克隆产生冲突。
- **npm 包名是 scoped 的。** npm 会因为 `dsh-next-steps` 与已存在的
  `dsh-nextsteps` 太相似而拒绝未加 scope 的名字。
- **staged 发布。** staged 版本会留下一个公开的 `0.0.0-stage` 占位版本；
  删除它需要 OTP，因为 bypass-2FA 的 token 不允许执行 unpublish。
- **发布处理延迟。** `npm publish` 返回后，`dist-tags` 可能还要几秒到几分钟
  才更新；轮询到 `latest` 匹配为止。
- **CI。** `.github/workflows/ci.yml` 会在 push `main`、`v*` tag 与
  pull request 时，用 Node 22 和 24 跑 `npm test` 与 `npm pack --dry-run`。
