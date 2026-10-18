import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* ------------------------------ 清单 ------------------------------ */

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(manifest.exports['./cordis.patch.yml'], './cordis.patch.yml')
assert.equal(manifest.files.includes('cordis.patch.yml'), true)
assert.equal(manifest.files.includes('LICENSE'), true)
assert.equal(manifest.files.includes('THIRD_PARTY_NOTICES.md'), true)
assert.equal(manifest.dsh.client.platform, 'web')
assert.equal(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-plugin-manager'), true)
assert.equal(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-tool'), false)
assert.equal(manifest.dependencies['@deepseek-ai/schemastery'], '~3.18.5')
assert.equal(manifest.dependencies['@wisdoverse/dsh-inline-media-viewer'], '1.0.12')
assert.equal(manifest.peerDependencies['@deepseek-ai/cordis'], '~4.0.5')
// 结果图展示走 read_image（dsh-image2-tool 机制），不依赖 dsh-attachment。
assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-attachment'], undefined)
assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-credentials'], '0.2.1-rc.2')
assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-settings'], '0.2.1-rc.2')
assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-tools'], '0.2.1-rc.2')
assert.equal(
  (await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')).replaceAll('\r\n', '\n'),
  '# Mount the host and Web client halves of the image generation plugin, plus the\n'
    + '# inline media viewer that renders image paths mentioned in replies as in-chat previews.\n'
    + '- insert:\n'
    + '    - id: image-gen\n'
    + '      name: dsh-image-gen\n'
    + '    - id: inline-media\n'
    + '      name: "@wisdoverse/dsh-inline-media-viewer"\n',
)

/* ---------------------------- 浏览器半 ---------------------------- */

let definition
globalThis.window = {
  __ModuleLoader__: {
    load(value) { definition = value },
  },
}
globalThis.document = {
  head: { appendChild() {} },
  createElement() { return { dataset: {}, textContent: '' } },
}

await import('../lib/client.js')
assert.equal(definition.id, 'dsh-image-gen')

const React = {
  Fragment: Symbol('Fragment'),
  createElement() {},
  useCallback() {},
  useEffect() {},
  useRef() {},
  useState() {},
}
const plugin = definition.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected dependency: ${id}`)
})
const client = plugin.__test

assert.equal(client.keyRefOf({ apiKeyEnv: 'MY_IMAGE_GEN_KEY' }), 'MY_IMAGE_GEN_KEY')
assert.equal(client.keyRefOf({}), 'IMAGE_GEN_API_KEY')
assert.deepEqual(client.draftsOf({
  baseURL: 'https://example.com/v1/images/generations',
  model: 'gpt-image-2',
  timeoutSeconds: 180,
}), {
  baseURL: 'https://example.com/v1/images/generations',
  model: 'gpt-image-2',
  editURL: '',
  timeoutSeconds: '180',
})
assert.deepEqual(client.opsFor({ baseURL: 'https://x/v1', model: '', editURL: '', timeoutSeconds: '90' }), [
  { op: 'set', path: ['baseURL'], value: 'https://x/v1' },
  { op: 'unset', path: ['model'] },
  { op: 'unset', path: ['editURL'] },
  { op: 'set', path: ['timeoutSeconds'], value: 90 },
])
assert.equal(client.isValidBaseUrl('https://example.com/v1'), true)
assert.equal(client.isValidBaseUrl('https://'), false)
assert.equal(client.isValidBaseUrl('example.com/v1'), false)
assert.equal(client.isValidBaseUrl(''), true)
assert.equal(client.isValidTimeout('180'), true)
assert.equal(client.isValidTimeout('0'), false)
assert.equal(client.isValidTimeout('3601'), false)
assert.equal(client.isValidTimeout('1.5'), false)
assert.equal(client.isValidTimeout(''), true)
assert.equal(client.dirtyOf(false, ''), false)
assert.equal(client.dirtyOf(false, 'sk-new'), true)
assert.equal(client.dirtyOf(true, ''), true)
assert.deepEqual(client.savePlan(false, 'sk-new'), { mutateSettings: false, writeKey: true })
assert.deepEqual(client.savePlan(true, ''), { mutateSettings: true, writeKey: false })
assert.deepEqual(
  client.opsFor({ baseURL: 'https://x/v1', model: 'gpt-image-2' }, new Set(['baseURL'])),
  [{ op: 'set', path: ['baseURL'], value: 'https://x/v1' }],
)

const clientRegistrations = []
plugin.apply({
  remote: {
    $on() { return () => {} },
    credentials: {
      async describe() { return { ok: true, value: {} } },
      async set() { return { ok: true } },
    },
  },
  locale: {
    register() { return () => {} },
    bind() { return key => key },
  },
  slots: {
    inject(_name, callback) { return callback() },
    register(meta, component) {
      clientRegistrations.push({ meta, component })
      return () => {}
    },
  },
  get() { return undefined },
  effect(callback) { return callback() },
})
// keyed 工具视图已移除：结果文本给出保存路径，由内置 read_image 展示结果图。
assert.deepEqual(
  clientRegistrations.filter(entry => entry.meta.name === 'tool.call.toolview'),
  [],
)

// 关键回归：第三方插件配置页注册进 plugins.row.config，key 必须是 `<包名>#<行 id>`，
// 与 cordis.patch.yml 的行 id 对应 —— 否则行不会出现「配置」控件。
const settingsCard = clientRegistrations.find(entry => entry.meta.name === 'plugins.row.config')
assert.ok(settingsCard, 'plugins.row.config 卡片已注册')
assert.equal(settingsCard.meta.key, 'dsh-image-gen#image-gen')
assert.equal(settingsCard.meta.id, undefined)

/* ---------------------------- 纯函数 ---------------------------- */

const server = await import('../lib/index.js')

assert.equal(server.normalizeGenerationsUrl('https://example.com/v1'), 'https://example.com/v1/images/generations')
assert.equal(
  server.normalizeGenerationsUrl('https://example.com/v1/images/generations/'),
  'https://example.com/v1/images/generations',
)
assert.throws(() => server.normalizeGenerationsUrl(''), /未配置接口地址/)
assert.throws(() => server.normalizeGenerationsUrl('ftp://x'), /http\(s\)/)
assert.equal(
  server.editUrlOf({ baseURL: 'https://x/v1/images/generations' }),
  'https://x/v1/images/edits',
)
assert.equal(server.editUrlOf({ baseURL: 'https://x/v1' }), 'https://x/v1/images/edits')
assert.equal(server.editUrlOf({ baseURL: 'https://x/v1/' }), 'https://x/v1/images/edits')
assert.equal(server.editUrlOf({ baseURL: 'https://x/v1', editURL: 'https://y/edits' }), 'https://y/edits')
assert.throws(() => server.editUrlOf({}), /未配置接口地址/)
assert.throws(() => server.editUrlOf({ baseURL: 'ftp://x' }), /http\(s\)/)
assert.throws(() => server.editUrlOf({ editURL: 'not a url' }), /合法的 http\(s\)/)
assert.equal(server.timeoutMsOf({ timeoutSeconds: 1 }), 1000)
assert.equal(server.timeoutMsOf({}), 180_000)
assert.throws(() => server.timeoutMsOf({ timeoutSeconds: 0 }), /1~3600/)
assert.throws(() => server.timeoutMsOf({ timeoutSeconds: 1.5 }), /1~3600/)
assert.doesNotThrow(() => server.validateSettings({ baseURL: 'https://x/v1', timeoutSeconds: 60 }))
assert.throws(() => server.validateSettings({ editURL: 'ftp://x' }), /http\(s\)/)

assert.equal(server.adaptiveSize('竖版海报', '1024x1024'), '768x1024')
assert.equal(server.adaptiveSize('横版横幅', '1024x1024'), '1024x768')
assert.equal(server.adaptiveSize('头像', '1024x1024'), '1024x1024')
assert.equal(server.resolveSize('adaptive', '手机壁纸', '1024x1024'), '768x1024')
assert.equal(server.resolveSize('portrait', '', '1024x1024'), '768x1024')
assert.equal(server.resolveSize('1024*768', '', '1024x1024'), '1024x768')
assert.throws(() => server.resolveSize('100x100', '', '1024x1024'), /16 的倍数/)
assert.throws(() => server.resolveSize('bogus', '', '1024x1024'), /非法尺寸/)

assert.deepEqual(server.buildGeneratePayload({ model: 'gpt-image-2' }, {
  prompt: '猫', size: '1024x1024', quality: 'low',
}), {
  model: 'gpt-image-2', prompt: '猫', size: '1024x1024', quality: 'low', n: 1, output_format: 'png',
})

const credsCtx = {
  credentials: {
    async resolve(ref) {
      return ref === 'IMAGE_GEN_API_KEY' || ref === 'OTHER_REF' ? { value: 'sk-ok', source: 'file' } : undefined
    },
  },
}
assert.equal(await server.resolveKey(credsCtx, { apiKey: 'sk-literal' }), 'sk-literal')
assert.equal(await server.resolveKey(credsCtx, {}), 'sk-ok')
assert.equal(await server.resolveKey(credsCtx, { apiKeyEnv: 'OTHER_REF' }), 'sk-ok')
await assert.rejects(server.resolveKey(credsCtx, { apiKeyEnv: 'NOPE' }), /未配置密钥/)
await assert.rejects(server.resolveKey(credsCtx, { apiKeyEnv: '1BAD' }), /不合法/)

assert.equal(server.detectedExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), '.png')
assert.throws(() => server.detectedExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), /PNG\/JPEG\/WebP/)
assert.equal(server.detectedExtension(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), '.jpg')
const webp = Buffer.alloc(20)
webp.write('RIFF', 0, 'latin1')
webp.write('WEBP', 8, 'latin1')
assert.equal(server.detectedExtension(webp), '.webp')
assert.throws(() => server.detectedExtension(Buffer.from([1, 2, 3])), /PNG\/JPEG\/WebP/)

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const outputDir = mkdtempSync(join(tmpdir(), 'dsh-image-gen-test-'))
const first = server.saveBlob(pngBytes, outputDir, {})
assert.match(first, /image-gen-\d{8}-\d{6}\.png$/)
assert.equal(existsSync(first), true)
const second = server.saveBlob(pngBytes, outputDir, {})
assert.match(second, /image-gen-\d{8}-\d{6}-2\.png$/)
assert.equal(readdirSync(outputDir).length, 2)


// 流式响应和 base64 在分配完整响应体之前受大小限制。
await assert.rejects(
  server.__test.readResponseBodyLimited(new Response('12345'), 4, '测试响应'),
  /测试响应超过/,
)
await assert.rejects(
  server.__test.readResponseBodyLimited(new Response('x', { headers: { 'content-length': '10' } }), 4, '声明响应'),
  /声明响应超过/,
)
assert.deepEqual(server.__test.decodeBase64Image(pngBytes.toString('base64'), pngBytes.length), pngBytes)
assert.throws(
  () => server.__test.decodeBase64Image(pngBytes.toString('base64'), pngBytes.length - 1),
  /超过下载上限/,
)
assert.throws(() => server.__test.decodeBase64Image('***='), /非法 base64/)

const alreadyAborted = new AbortController()
alreadyAborted.abort()
const combined = server.__test.combinedSignal(alreadyAborted.signal, 1000)
assert.equal(combined.signal.aborted, true)
combined.cleanup()
const timedSignal = server.__test.combinedSignal(undefined, 5)
await new Promise(resolve => setTimeout(resolve, 15))
assert.equal(timedSignal.signal.aborted, true)
assert.equal(timedSignal.timedOut(), true)
timedSignal.cleanup()

// 参考图相对路径以会话 cwd 为基准，MIME 和文件名按魔数规范化。
const refsDir = mkdtempSync(join(tmpdir(), 'dsh-image-gen-refs-'))
writeFileSync(join(refsDir, 'reference.jpg'), pngBytes)
const parts = server.__test.readReferenceImages(['reference.jpg'], {
  agent: { session: { header: { cwd: refsDir } } },
})
assert.equal(parts[0].mime, 'image/png')
assert.equal(parts[0].name, 'reference.png')
assert.equal(parts[0].path, join(refsDir, 'reference.jpg'))
assert.throws(
  () => server.__test.readReferenceImages(Array(9).fill('reference.jpg'), { agent: { session: { header: { cwd: refsDir } } } }),
  /最多 8 张/,
)
writeFileSync(join(refsDir, 'not-image.png'), Buffer.from('not an image'))
assert.throws(
  () => server.__test.readReferenceImages(['not-image.png'], { agent: { session: { header: { cwd: refsDir } } } }),
  /PNG\/JPEG\/WebP/,
)

const originalFetch = globalThis.fetch
globalThis.fetch = async () => new Response('missing', { status: 404 })
await assert.rejects(server.__test.downloadImage('https://x.test/image.png'), /HTTP 404/)
globalThis.fetch = originalFetch

/* -------------------------- 自有 HTTP API -------------------------- */

function fakeRes() {
  const captured = { status: 0, headers: null, body: '' }
  return {
    captured,
    writeHead(status, headers) { captured.status = status; captured.headers = headers },
    end(body) { captured.body = body },
  }
}

function fakeReq(method, path, body) {
  const req = { method, url: path }
  if (body !== undefined) {
    req.on = (event, callback) => {
      if (event === 'data') callback(Buffer.from(JSON.stringify(body)))
      if (event === 'end') setTimeout(callback, 0)
    }
  } else {
    req.on = (event, callback) => { if (event === 'end') setTimeout(callback, 0) }
  }
  return req
}

const httpValue = { baseURL: 'https://x/v1', model: 'gpt-image-2', apiKey: 'sk-current-secret' }
const mutateCalls = []
const httpCtx = {
  get(service) {
    if (service === 'attachments') {
      return {
        async readImage(ref) {
          assert.deepEqual(ref, {
            attachmentId: testAttachmentId,
            mediaType: 'image/png',
            bytes: pngBytes.length,
            width: 1,
            height: 1,
          })
          return { ref, data: pngBytes }
        },
      }
    }
    if (service === 'settings') {
      return {
        describe(options) {
          assert.deepEqual(options, { redactSecrets: true })
          return [{ ns: 'image-gen', revision: 3, value: { ...httpValue, apiKey: 'sk-descriptor-secret' } }]
        },
        writable: true,
        async mutate(ns, ops, expectedRevision) {
          mutateCalls.push({ ns, ops, expectedRevision })
          if (ops[0]?.value === 'https://conflict.test') {
            const conflict = new Error('conflict')
            conflict.code = 'SETTINGS_CONFLICT'
            throw conflict
          }
          httpValue.baseURL = ops.find(op => op.path?.[0] === 'baseURL')?.value ?? httpValue.baseURL
        },
      }
    }
    return undefined
  },
}
const httpCurrent = () => httpValue

// GET state
{
  const res = fakeRes()
  await server.handleImageGenHttp(httpCtx, httpCurrent, fakeReq('GET', '/image-gen/state'), res)
  const payload = JSON.parse(res.captured.body)
  assert.equal(res.captured.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.value.revision, 3)
  assert.equal(payload.value.writable, true)
  assert.equal(payload.value.value.baseURL, 'https://x/v1')
  assert.equal(Object.hasOwn(payload.value.value, 'apiKey'), false)
}
// POST mutate 成功
{
  const res = fakeRes()
  await server.handleImageGenHttp(httpCtx, httpCurrent, fakeReq('POST', '/image-gen/mutate', {
    ops: [{ op: 'set', path: ['baseURL'], value: 'https://y/v1' }],
    expectedRevision: 3,
  }), res)
  assert.equal(res.captured.status, 200)
  assert.equal(mutateCalls.length, 1)
  assert.equal(mutateCalls[0].ns, 'image-gen')
  assert.equal(httpValue.baseURL, 'https://y/v1')
}
// POST mutate 冲突
{
  const res = fakeRes()
  await server.handleImageGenHttp(httpCtx, httpCurrent, fakeReq('POST', '/image-gen/mutate', {
    ops: [{ op: 'set', path: ['baseURL'], value: 'https://conflict.test' }],
    expectedRevision: 3,
  }), res)
  const payload = JSON.parse(res.captured.body)
  assert.equal(res.captured.status, 200)
  assert.equal(payload.ok, false)
  assert.equal(payload.error.code, 'settings-conflict')
}
// POST 非法体、越权字段和非法值都在 mutate 前返回 400。
{
  const callsBeforeInvalid = mutateCalls.length
  const res = fakeRes()
  await server.handleImageGenHttp(httpCtx, httpCurrent, fakeReq('POST', '/image-gen/mutate', { ops: 'nope' }), res)
  assert.equal(res.captured.status, 400)
  for (const body of [
    { ops: [{ op: 'set', path: ['apiKey'], value: 'sk-leak' }], expectedRevision: 3 },
    { ops: [{ op: 'set', path: ['unknown'], value: 'x' }], expectedRevision: 3 },
    { ops: [{ op: 'set', path: ['baseURL'], value: 'not-a-url' }], expectedRevision: 3 },
    { ops: [{ op: 'set', path: ['timeoutSeconds'], value: 0 }], expectedRevision: 3 },
    { ops: [{ op: 'set', path: ['model'], value: 'x' }] },
  ]) {
    const invalidRes = fakeRes()
    await server.handleImageGenHttp(httpCtx, httpCurrent, fakeReq('POST', '/image-gen/mutate', body), invalidRes)
    assert.equal(invalidRes.captured.status, 400)
  }
  assert.equal(mutateCalls.length, callsBeforeInvalid)
  const res404 = fakeRes()
  await server.handleImageGenHttp(httpCtx, httpCurrent, fakeReq('GET', '/image-gen/other'), res404)
  assert.equal(res404.captured.status, 404)
}

/* ------------------------------ apply ------------------------------ */

// Config 是 cordis 运行期读取的插件 schema：可编辑字段标 volatile，
// apiKey 只允许组合层字面值，不进入表单投影。
assert.equal(typeof server.Config?.toJSON, 'function')
assert.equal(server.Config.dict.baseURL.meta.volatile, true)
assert.equal(server.Config.dict.apiKeyEnv.meta.volatile, true)
assert.equal(server.Config.dict.apiKeyEnv.meta.default, 'IMAGE_GEN_API_KEY')
assert.equal(server.Config.dict.timeoutSeconds.meta.default, 180)
assert.equal(server.Config.dict.apiKey.meta.volatile, undefined)

let scopeValue = {}
// volatile 字段在运行期是 live ref（{ get() }）；用代理让每个字段读都落到 scopeValue。
const liveConfig = new Proxy({}, {
  get: (_target, key) => ({ get: () => scopeValue[key] }),
})
const configureCalls = []
const registrations = { tools: [], routes: [] }
const pendingInjections = []
const applyCtx = {
  tools: {
    register(definition) { registrations.tools.push(definition) },
  },
  credentials: {
    async resolve(ref) { return ref === 'IMAGE_GEN_API_KEY' ? { value: 'sk-ok', source: 'file' } : undefined },
  },
  get(service) {
    if (service === 'attachments') return attachmentCtx.get('attachments')
    if (service === 'webServer') {
      return {
        register(route) { registrations.routes.push(route); return () => {} },
      }
    }
    if (service === 'settings') {
      return {
        describe() { return [{ ns: 'image-gen', revision: 1 }] },
        writable: true,
        async mutate() {},
        configure(policy) { configureCalls.push(policy); return () => {} },
      }
    }
    return undefined
  },
  logger: { info() {}, warn() {} },
  inject(services, callback) {
    pendingInjections.push({ services, callback })
  },
  effect(callback) {
    const result = callback()
    return typeof result === 'function' ? result : () => {}
  },
}

await server.apply(applyCtx, liveConfig, {
  defineTool: definition => definition,
})

// 配置页由浏览器半自绘，平台的自动表单对本 entry 关闭。
assert.deepEqual(configureCalls, [{ auto: false }])
assert.deepEqual(registrations.tools.map(tool => tool.name), ['image-generate', 'image-edit'])
assert.equal(registrations.routes.length, 0)
assert.deepEqual(pendingInjections.map(entry => entry.services), [['webServer']])
const webInjection = pendingInjections[0]
webInjection.callback({
  webServer: {
    register(route) { registrations.routes.push(route); return () => {} },
  },
  effect: applyCtx.effect,
})
assert.equal(registrations.routes.length, 1)
assert.equal(registrations.routes[0].path, '/image-gen')

// 结果渲染为纯文本：给出保存的相对路径，模型按指引调用内置 read_image 展示结果图。
const generateTool = registrations.tools[0]
const renderedOutcome = generateTool.output.render({}, {
  mode: 'generate',
  provider: 'image-gen',
  model: 'gpt-image-2',
  size: '1024x1024',
  quality: 'low',
  files: [first],
  saved: ['outputs/image-gen/image-gen-test.png'],
})
assert.equal(renderedOutcome.length, 1)
assert.equal(renderedOutcome[0].type, 'text')
assert.match(renderedOutcome[0].text, /图片已保存：outputs\/image-gen\/image-gen-test\.png/)
assert.equal(renderedOutcome.some(block => block.type === 'image'), false)

// 工具在未配置接口地址时给出设置指引。
scopeValue = {}
await assert.rejects(
  generateTool.execute({ prompt: '猫' }, { signal: { aborted: false } }),
  /未配置接口地址/,
)

// 有接口地址但密钥引用未配置。
scopeValue = { baseURL: 'https://x/v1', apiKeyEnv: 'NOPE_REF' }
await assert.rejects(
  generateTool.execute({ prompt: '猫' }, { signal: { aborted: false } }),
  /未配置密钥/,
)

// count 校验。
scopeValue = { baseURL: 'https://x/v1', apiKey: 'sk' }
await assert.rejects(
  generateTool.execute({ prompt: '猫', count: 9 }, { signal: { aborted: false } }),
  /count 必须是 1~8/,
)

// 完整生成链落盘并在结果里给出相对保存路径。
scopeValue = { baseURL: 'https://x/v1', apiKey: 'sk-test' }
const fetchBeforeGenerate = globalThis.fetch
globalThis.fetch = async () => new Response(JSON.stringify({
  data: [{ b64_json: pngBytes.toString('base64') }],
}), { status: 200, headers: { 'content-type': 'application/json' } })
try {
  const generated = await generateTool.execute({ prompt: '测试图片' }, {
    signal: new AbortController().signal,
    agent: {
      session: { header: { cwd: outputDir } },
    },
  })
  assert.equal(generated.files.length, 1)
  assert.equal(generated.saved.length, 1)
  assert.match(generated.saved[0], /outputs\/image-gen\/image-gen-\d{8}-\d{6}\.png$/)
  assert.equal(existsSync(join(outputDir, generated.saved[0])), true)
} finally {
  globalThis.fetch = fetchBeforeGenerate
}

// 不注入测试桩，确保 package.json 声明的真实运行模块可以解析并完成 apply。
const realTools = []
await server.apply({
  tools: { register(value) { realTools.push(value) } },
  credentials: { async resolve() { return undefined } },
  get() { return undefined },
  inject() {},
  effect(callback) { return callback() },
}, {})
assert.deepEqual(realTools.map(tool => tool.name), ['image-generate', 'image-edit'])

console.log('plugin tests passed')
