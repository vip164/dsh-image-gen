# DSH Image Gen

Adds `gpt-image-2` generation to DeepSeek Harness by calling any third-party
**OpenAI Images compatible endpoint**. Fill in `baseURL` and `API Key` and use
text-to-image and image-to-image tools directly in conversation.

[中文](./README.zh-CN.md)

> This plugin is a rewritten, fixed fork of
> [dsh-image2-draw](https://github.com/JuneLearn/dsh-image2-draw.git). It fixes a
> load-time bug that broke the original (see "Bug fix" below).

## Features

- A dedicated **Image Gen** card under **Settings → Plugins → Plugin settings**.
- Only `baseURL` and `API Key` are required; the default model is `gpt-image-2`.
- `baseURL` accepts shorthands like `https://example.com/v1`; the plugin appends
  `/images/generations` automatically.
- The edit endpoint defaults to `/images/edits` derived from `baseURL`, or can be
  set explicitly via `editURL`.
- `image-generate` (text-to-image) tool, generating 1–8 images sequentially.
- `image-edit` (image-to-image) tool with 1–8 PNG / JPEG / WebP reference images.
- Adaptive portrait / landscape / square sizes, plus validated custom sizes.
- Results render inline in conversation with thumbnails, lightbox zoom, and save-as.
- Images are also written to `outputs/image-gen/` in the session working directory
  (auto-numbered, never overwriting existing files).
- API Key is written only to DSH credentials (default ref `IMAGE_GEN_API_KEY`); it is
  never echoed or stored in the settings document.
- Validates config writes, response sizes, timeouts, and reference files; 524/timeout
  is not auto-retried to avoid duplicate billing.

## Bug fix

The original plugin registered its settings card into the **keyed** slot
`settings.plugin.item` using `id` instead of `key`, producing:

```text
Failed to load plugins
dsh-image2-draw
failed to apply loader entry ... (dsh-image2-draw): keyed slot "settings.plugin.item" requires options.key
```

That slot's contract is: **key by the settings namespace the card edits**. This plugin
uses the namespace as the key:

```js
ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
  name: 'settings.plugin.item',
  key: NS,            // the settings namespace (image-gen), not `id`
  locale: 'settings.imageGen',
  inject: () => ({ api: connection.api, remote: ctx.remote, t }),
}, ImageGenCard))
```

`NS === 'image-gen'` matches the namespace registered on the Host via
`installSettingsSection`, so the configurable-plugins tab pairs the card with the
namespace it edits.

## Install

### Prerequisites

- [Node.js](https://nodejs.org/) (24 LTS recommended).
- [Git](https://git-scm.com/).
- [pnpm](https://pnpm.io/installation).

### Via npx

```bash
npx --yes -p @deepseek-ai/dsh dsh plugin --profile web add github:Anyway-one/dsh-image-gen
npx --yes -p @deepseek-ai/dsh dsh web
```

Pin a release with `github:Anyway-one/dsh-image-gen#v0.1.0`.

### Via pnpm + Harness source

```bash
cd <deepseek-harness>
pnpm dsh plugin --profile web add github:Anyway-one/dsh-image-gen
pnpm dsh web
```

## Configuration

1. Open **Settings → Plugins → Plugin settings** and expand the **Image Gen** card.
2. Fill in **Endpoint (baseURL)**, e.g. `https://example.com/v1`.
3. Fill in **API Key** (stored in credentials, default ref `IMAGE_GEN_API_KEY`).
4. Optionally adjust **Model** (default `gpt-image-2`), **Edit endpoint**, or **Timeout**.
5. Save, then use `image-generate` / `image-edit` in conversation.

## Development

```bash
pnpm test   # pure-function unit tests (no DSH boot required)
```

Layout:

- `lib/index.js` — Host half: `image-gen` settings namespace, `image-generate` /
  `image-edit` tools, `/image-gen/*` HTTP routes.
- `lib/client.js` — Browser half: `settings.plugin.item` config card (keyed), and
  `tool.call.toolview` result cards.
- `cordis.patch.yml` — mounts both halves (entry id `image-gen`).

## License

[MIT](./LICENSE)
