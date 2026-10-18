# DSH Image Gen 生图插件

为 DeepSeek Harness 增加 `gpt-image-2` 生图能力：通过任意第三方提供的
**OpenAI Images 兼容接口**调用 `gpt-image-2`，只需填写 `baseURL` 和 `API Key`，
即可在对话中使用文生图与图生图工具。

[English](./README.md)

> 本插件在 [dsh-image2-draw](https://github.com/JuneLearn/dsh-image2-draw.git)
> 以及 [Anyway-one/dsh-image-gen](https://github.com/Anyway-one/dsh-image-gen.git) 的基础上
> 重写并修复了一个会导致插件无法加载的关键 bug（见下文"关于 bug 修复"）。

## 兼容性

- 需要 **DeepSeek Harness 0.2.1-rc.2**（peer 依赖精确钉在
  `@deepseek-ai/dsh-attachment` / `dsh-credentials` / `dsh-settings` / `dsh-tools`
  `0.2.1-rc.2`，cordis `~4.0.5`）。
- v0.2.0 已迁移到 0.2.1-rc.2 的插件 API：设置表单由顶层 `Config` schema 的
  volatile 字段自动投影；配置页改经 `plugins.row.config` 槽注册；凭证读写走新的
  `remote.credentials` RPC。不再使用已移除的 `settings.plugin.item` 槽、
  `installSettingsSection` 与 `dsh-client-runtime` 注入。

## 功能

- 在 **插件 → 已安装插件 → dsh-image-gen** 的 `image-gen` 行上点 **配置**，进入
  独立的 **Image Gen** 配置页。
- 只需配置 `baseURL` 和 `API Key`；默认模型为 `gpt-image-2`。
- `baseURL` 可填写 `https://example.com/v1` 这样的简写，插件会自动补全
  `/images/generations`。
- 图生图端点默认由 `baseURL` 推导为 `/images/edits`，也可单独配置 `editURL`。
- 提供 `image-generate` 文生图工具，支持一次顺序生成 1~8 张图片。
- 提供 `image-edit` 图生图工具，支持 1~8 张 PNG / JPEG / WebP 参考图。
- 支持自适应横版、竖版和方图，也支持传入符合约束的自定义尺寸。
- 结果展示采用与
  [dsh-image2-tool](https://github.com/544244857/dsh-image2-plugin)
  相同的机制：结果文本给出保存的相对路径（`outputs/image-gen/…`），模型按指引
  调用内置 `read_image` 检查输出（DSH 内置的带图卡片），并在回复末尾附上指向
  结果图的 markdown 链接——点击即可在侧边栏预览原图。不保存会话附件、
  不自建图片视图、不依赖内联预览组件。
- 图片同时保存到当前会话工作目录的 `outputs/image-gen/`，重名自动编号，不覆盖旧文件。
- API Key 只写入 DSH credentials（默认引用 `IMAGE_GEN_API_KEY`），不回显、不进设置文档。
- 对配置写入、响应大小、超时和参考图文件实施校验；524 / 超时不会自动重试，避免重复计费。

## 安装

### 环境准备

- [Node.js](https://nodejs.org/)（建议 24 LTS；DSH 支持 22.19.x 或 24+）。
- [Git](https://git-scm.com/)。
- [pnpm](https://pnpm.io/installation)（`dsh plugin` 会在 profile 目录中调用 pnpm）。

### 使用 npx（普通用户推荐）

```bash
npx --yes -p @deepseek-ai/dsh dsh plugin --profile web add github:vip164/dsh-image-gen
npx --yes -p @deepseek-ai/dsh dsh web
```

如需固定到某个版本 tag，可写作 `github:vip164/dsh-image-gen#v0.2.0`。

也可以从本地目录安装：

```bash
npx --yes -p @deepseek-ai/dsh dsh plugin --profile web add /path/to/dsh-image-gen
```

### 使用 pnpm 与 Harness 源码（开发者推荐）

```bash
cd <deepseek-harness>
pnpm dsh plugin --profile web add github:vip164/dsh-image-gen
pnpm dsh web
```

## 配置

1. 打开 **插件 → 已安装插件 → dsh-image-gen**，在 `image-gen` 行上选择 **配置**。
2. 填写 **接口地址（baseURL）**，例如 `https://example.com/v1`。
3. 填写 **API Key**（写入 credentials，默认引用 `IMAGE_GEN_API_KEY`）。
4. 可选：修改 **模型**（默认 `gpt-image-2`）、**图生图端点**、**超时**。
5. 保存后即可在对话中使用 `image-generate` / `image-edit` 工具。

![img.png](assets/settings.png)

## 使用案例
![use-case.png](assets/use-case.png)

## 开发

```bash
# 纯函数单元测试（无需启动 DSH）
pnpm test   # 或 npm test / node tests/plugin.test.mjs
```

代码结构：

- `lib/index.js` — host 半：顶层 `Config` schema（volatile 字段自动投影设置表单）、
  settings 命名空间 `image-gen`、`image-generate` / `image-edit` 工具、
  `/image-gen/*` 自有 HTTP 路由。
- `lib/client.js` — 浏览器半：仅注册 `plugins.row.config` 配置页（key
  `dsh-image-gen#image-gen`）；结果图由内置 `read_image` 卡片展示。
- `cordis.patch.yml` — 把 host / client 两半挂载进组合（entry id `image-gen`），
  并同时挂载内置的内联媒体查看器（entry id `inline-media`）。

## License

[MIT](./LICENSE)
