# DSH Image Gen 生图插件

为 DeepSeek Harness 增加 `gpt-image-2` 生图能力：通过任意第三方提供的
**OpenAI Images 兼容接口**调用 `gpt-image-2`，只需填写 `baseURL` 和 `API Key`，
即可在对话中使用文生图与图生图工具。

[English](./README.md)

> 本插件在 [dsh-image2-draw](https://github.com/JuneLearn/dsh-image2-draw.git)
> 的基础上重写并修复了一个会导致插件无法加载的关键 bug（见下文“关于 bug 修复”）。

## 功能

- 在 **设置 → 插件 → 插件配置** 中提供独立的 **Image Gen** 配置卡片。
- 只需配置 `baseURL` 和 `API Key`；默认模型为 `gpt-image-2`。
- `baseURL` 可填写 `https://example.com/v1` 这样的简写，插件会自动补全
  `/images/generations`。
- 图生图端点默认由 `baseURL` 推导为 `/images/edits`，也可单独配置 `editURL`。
- 提供 `image-generate` 文生图工具，支持一次顺序生成 1~8 张图片。
- 提供 `image-edit` 图生图工具，支持 1~8 张 PNG / JPEG / WebP 参考图。
- 支持自适应横版、竖版和方图，也支持传入符合约束的自定义尺寸。
- 生成图片直接显示在聊天界面；专用工具卡片支持缩略图、点击放大和“另存为”。
- 图片同时保存到当前会话工作目录的 `outputs/image-gen/`，重名自动编号，不覆盖旧文件。
- API Key 只写入 DSH credentials（默认引用 `IMAGE_GEN_API_KEY`），不回显、不进设置文档。
- 对配置写入、响应大小、超时和参考图文件实施校验；524 / 超时不会自动重试，避免重复计费。

## 关于 bug 修复

原插件在浏览器侧把设置卡片注册到了 `settings.plugin.item` 这个 **keyed slot**，
却使用了 `id` 而不是 `key`，导致加载时报错：

```text
Failed to load plugins
dsh-image2-draw
failed to apply loader entry ... (dsh-image2-draw): keyed slot "settings.plugin.item" requires options.key
```

该 slot 的契约是：**以它编辑的 settings 命名空间作为 `key`**。本插件的修复是：

```js
ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
  name: 'settings.plugin.item',
  key: NS,            // ← 必须是 settings 命名空间（image-gen），不能用 id
  locale: 'settings.imageGen',
  inject: () => ({ api: connection.api, remote: ctx.remote, t }),
}, ImageGenCard))
```

其中 `NS === 'image-gen'`，与 host 侧 `installSettingsSection` 注册的命名空间完全一致，
“可配置插件”页签才能把卡片和它编辑的命名空间配对起来。

## 安装

### 环境准备

- [Node.js](https://nodejs.org/)（建议 24 LTS；DSH 支持 22.19.x 或 24+）。
- [Git](https://git-scm.com/)。
- [pnpm](https://pnpm.io/installation)（`dsh plugin` 会在 profile 目录中调用 pnpm）。

### 使用 npx（普通用户推荐）

```bash
npx --yes -p @deepseek-ai/dsh dsh plugin --profile web add github:Anyway-one/dsh-image-gen
npx --yes -p @deepseek-ai/dsh dsh web
```

如需固定到某个版本 tag，可写作 `github:Anyway-one/dsh-image-gen#v0.1.0`。

也可以从本地目录安装：

```bash
npx --yes -p @deepseek-ai/dsh dsh plugin --profile web add /path/to/dsh-image-gen
```

### 使用 pnpm 与 Harness 源码（开发者推荐）

```bash
cd <deepseek-harness>
pnpm dsh plugin --profile web add github:Anyway-one/dsh-image-gen
pnpm dsh web
```

## 配置

1. 打开 **设置 → 插件 → 插件配置**，展开 **Image Gen** 卡片。
2. 填写 **接口地址（baseURL）**，例如 `https://example.com/v1`。
3. 填写 **API Key**（写入 credentials，默认引用 `IMAGE_GEN_API_KEY`）。
4. 可选：修改 **模型**（默认 `gpt-image-2`）、**图生图端点**、**超时**。
5. 保存后即可在对话中使用 `image-generate` / `image-edit` 工具。
![img.png](assets/settings.png)

## 使用效果
![use-case.png](assets/use-case.png)

## 开发

```bash
# 纯函数单元测试（无需启动 DSH）
pnpm test   # 或 npm test / node tests/plugin.test.mjs
```

代码结构：

- `lib/index.js` — host 半：settings 命名空间 `image-gen`、`image-generate` /
  `image-edit` 工具、`/image-gen/*` 自有 HTTP 路由。
- `lib/client.js` — 浏览器半：`settings.plugin.item` 配置卡片（keyed 注册）、
  `tool.call.toolview` 结果卡片。
- `cordis.patch.yml` — 把 host / client 两半挂载进组合（entry id `image-gen`）。

## License

[MIT](./LICENSE)
