# 更新日志

`@zongcn/dsh-next-steps` 的所有重要变更记录在此。格式遵循
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本](https://semver.org/lang/zh-CN/)。0.1.2 及更早的版本早于本文件，
仅为完整性列出。

## [未发布]

## [0.1.3] — 2026-11-09

### 修复

- **浏览器半改为按包名注册。** `client.js` 之前写的是
  `window.__ModuleLoader__.load({ id: 'dsh-next-steps' })`，而 client-modules
  是按包名（`@zongcn/dsh-next-steps`）给每个 boot row 建键的。旧的注册字面量让
  加载器判定「这批没注册上」，于是用该 row 的单资源 URL 重新取一次、把同一份
  字节执行了第二遍，表现为
  `client-modules: duplicate factory registration for "dsh-next-steps"`，
  建议条也就没能挂载。
- `scripts/verify-dock.mjs` 新增断言：注册 id 必须等于 `package.json` 的
  `name`，以后改名不会再悄悄漂移。

### 变更

- `cordis.patch.yml` 的 bundle 行保留短标识 `id: dsh-next-steps`，只有
  `name` 必须是包名。
- 两份 README 示例与两份发布清单同步了 scoped 包名、桌面端重装注意事项，以及
  干净 profile 上 `curl` 的 token/cookie 坑。

### 事故 — `web boot: 1 entry did not activate`（2026-11-08）

包名从 `dsh-next-steps` 改成 `@zongcn/dsh-next-steps` 之后，桌面应用起不来
Web 客户端：

```
Error: web boot: 1 entry did not activate
@zongcn/dsh-next-steps: import failed (see console for the import error)
```

起因是两处互不相干的错配。

1. **依赖键过期。** profile 里仍是
   `"dsh-next-steps": "link:/Applications/project/next-steps"`，因此
   `node_modules/@zongcn/dsh-next-steps` 根本不存在，而 bundle 的 patch 行要的
   正是这个名字。loader 从 profile 根解析行里的 `name`，该条目因此拿不到 fiber。
2. **注册 id 过期。** 浏览器半加载后，它写死的 `dsh-next-steps` 与 boot row id
   不一致，触发重复工厂注册错误，建议条无法挂载。

处理顺序：先在「设置 → 插件」里重新安装 bundle（只点开关不会重跑 pnpm，依赖键
会继续过期——见 README 的注意事项），再发布注册 id 的修复。之后在干净的
`DSH_HOME` 与真实桌面应用里都做了端到端验证。

防复发：`verify-dock` 断言钉住注册 id；README 与 RELEASING 记录了重装注意事项和
token/cookie 坑；上游行为记在 issue
[#2](https://github.com/WURONZON/dsh-next-steps/issues/2) 与
[#3](https://github.com/WURONZON/dsh-next-steps/issues/3)。

## [0.1.2] — 2026-11-08

早于本文件：首次发布后的元数据与打包修正。

## [0.1.1] — 2026-11-08

早于本文件。

## [0.1.0] — 2026-11-08

`@zongcn/dsh-next-steps` 首次发布：每轮回答结束后在输入框上方给出最多三条
建议提示，每轮一次模型调用，只写入草稿（插件自身从不发送提示）。
