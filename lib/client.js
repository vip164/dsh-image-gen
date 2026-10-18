/**
 * dsh-image-gen — image-gen 生图插件（浏览器半）。
 *
 * 仿官方配置页伴生包（ui-settings-web-search）形态，注册进 插件 → 已安装 →
 * 本组合包 image-gen 行 的「配置」页（plugins.row.config，key 为 `<包名>#<行 id>`）：
 * 统一配置「API Key + 接口地址」，接口地址输入框 placeholder 默认显示接口格式。
 *
 * 数据通道：命名空间 image-gen 不在 apiproxy 白名单，走插件自有
 * /image-gen/* 路由；密钥走官方 credentials RPC（remote.credentials，无白名单）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-image-gen',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const { createElement: h, useCallback, useEffect, useRef, useState } = React

    const NS = 'image-gen'
    const DEFAULT_KEY_ENV = 'IMAGE_GEN_API_KEY'

    const zh = {
      nav: 'Image Gen 生图',
      cardDesc: '配置 image-gen 生图 API：统一设置 API Key 与接口地址，文生图/图生图',
      expand: '展开',
      collapse: '折叠',
      unsaved: '有未保存的修改',
      loading: '正在读取配置...',
      loadFailed: '读取失败',
      saveFailed: '保存失败',
      saved: '已保存',
      save: '保存',
      saving: '保存中...',
      refresh: '刷新',
      conflict: '配置已被其他页面修改，请刷新后重试。',
      notWritable: '当前设置只读，无法修改。',
      apiKey: 'API Key',
      apiKeyHint: '写入凭据存储（IMAGE_GEN_API_KEY），不回显；与接口地址一起保存后生效',
      keySet: '已配置',
      keyUnset: '未配置',
      baseUrl: '接口地址',
      baseUrlHint: '未以 /images/generations 结尾会自动补全；留空则无法生图',
      model: '模型',
      modelHint: '留空使用默认 gpt-image-2',
      editUrl: '图生图端点（可选）',
      editUrlHint: '留空时由接口地址自动推导 /images/edits',
      timeout: '超时（秒）',
      timeoutHint: '请求超时时间，范围 1~3600，默认 180',
      invalidUrl: '必须是合法的 http(s) URL',
      invalidNumber: '必须是 1~3600 的整数',
    }

    const en = {
      nav: 'Image Gen',
      cardDesc: 'Configure the image-gen API: one API key and endpoint for text/image generation',
      expand: 'Expand',
      collapse: 'Collapse',
      unsaved: 'Unsaved changes',
      loading: 'Loading configuration...',
      loadFailed: 'Failed to load',
      saveFailed: 'Failed to save',
      saved: 'Saved',
      save: 'Save',
      saving: 'Saving...',
      refresh: 'Refresh',
      conflict: 'Settings changed elsewhere. Refresh and try again.',
      notWritable: 'Settings are read-only here.',
      apiKey: 'API Key',
      apiKeyHint: 'Stored in credentials (IMAGE_GEN_API_KEY), write-only; applied together with the endpoint on save',
      keySet: 'Configured',
      keyUnset: 'Missing',
      baseUrl: 'Endpoint',
      baseUrlHint: '/images/generations is appended when missing; leave blank to disable generation',
      model: 'Model',
      modelHint: 'Defaults to gpt-image-2 when blank',
      editUrl: 'Edit endpoint (optional)',
      editUrlHint: 'Derived as /images/edits from the endpoint when blank',
      timeout: 'Timeout (s)',
      timeoutHint: 'Request timeout from 1 to 3600, default 180',
      invalidUrl: 'Must be a valid http(s) URL',
      invalidNumber: 'Must be an integer from 1 to 3600',
    }

    /* ------------------------- 纯函数（__test） ------------------------- */

    function objectOf(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
    }

    function keyRefOf(value) {
      const env = String(objectOf(value).apiKeyEnv ?? '').trim()
      return env.length > 0 ? env : DEFAULT_KEY_ENV
    }

    /** 由命名空间值生成表单草稿（文本形态）。 */
    function draftsOf(value) {
      const source = objectOf(value)
      return {
        baseURL: typeof source.baseURL === 'string' ? source.baseURL : '',
        model: typeof source.model === 'string' ? source.model : '',
        editURL: typeof source.editURL === 'string' ? source.editURL : '',
        timeoutSeconds: source.timeoutSeconds === undefined ? '' : String(source.timeoutSeconds),
      }
    }

    /** 保存用的 mutate ops：空草稿 → unset（回继承默认），非空 → set。 */
    function opsFor(drafts, selectedFields) {
      const ops = []
      const fields = selectedFields ?? ['baseURL', 'model', 'editURL', 'timeoutSeconds']
      for (const field of fields) {
        const draft = String(drafts[field] ?? '').trim()
        if (draft === '') {
          ops.push({ op: 'unset', path: [field] })
        } else {
          const value = field === 'timeoutSeconds' ? Number(draft) : draft
          ops.push({ op: 'set', path: [field], value })
        }
      }
      return ops
    }

    function isValidBaseUrl(text) {
      const value = String(text ?? '').trim()
      if (value === '') return true
      try {
        const parsed = new URL(value)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      } catch {
        return false
      }
    }

    function isValidTimeout(text) {
      const value = String(text ?? '').trim()
      if (value === '') return true
      if (!/^\d+$/.test(value)) return false
      const parsed = Number(value)
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= 3600
    }

    function dirtyOf(settingsDirty, keyDraft) {
      return settingsDirty === true || String(keyDraft ?? '').trim() !== ''
    }

    function savePlan(settingsDirty, keyDraft) {
      return {
        mutateSettings: settingsDirty === true,
        writeKey: String(keyDraft ?? '').trim() !== '',
      }
    }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /**
     * 调用插件自有 HTTP API（/image-gen/*）。
     * 返回 { ok:true, value }；冲突/业务错误抛带 code 的 Error。
     */
    async function fetchJson(path, body) {
      const response = await fetch(path, body === undefined
        ? undefined
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          })
      let payload
      try {
        payload = await response.json()
      } catch {
        throw new Error(`Image Gen 服务返回异常（HTTP ${response.status}）`)
      }
      if (response.status !== 200 || payload?.ok !== true) {
        const error = payload?.error ?? {}
        const failure = new Error(error.message ?? `Image Gen 服务错误（HTTP ${response.status}）`)
        failure.code = error.code ?? 'unknown'
        throw failure
      }
      return payload.value
    }

    /* ------------------------------ 组件 ------------------------------ */

    function Field(props) {
      const { id, label, hint, text, placeholder, disabled, invalid, invalidLabel, onEdit } = props
      return h('div', { className: 'dsh-ig-field' },
        h('div', { className: 'dsh-ig-field-head' },
          h('label', { className: 'dsh-ig-label', htmlFor: id }, label)),
        h('input', {
          id,
          className: invalid ? 'dsh-ig-input dsh-ig-input-invalid' : 'dsh-ig-input',
          type: 'text',
          value: text,
          placeholder: placeholder ?? '',
          disabled,
          onChange: event => onEdit(event.target.value),
        }),
        h('p', { className: invalid ? 'dsh-ig-invalid' : 'dsh-ig-hint' }, invalid ? invalidLabel : hint))
    }

    function KeyField(props) {
      const { label, hint, text, disabled, configured, stateLabel, onEdit } = props
      return h('div', { className: 'dsh-ig-field' },
        h('div', { className: 'dsh-ig-field-head' },
          h('label', { className: 'dsh-ig-label' }, label),
          h('span', { className: configured ? 'dsh-ig-badge dsh-ig-badge-ok' : 'dsh-ig-badge' }, stateLabel)),
        h('input', {
          className: 'dsh-ig-input',
          type: 'password',
          name: 'image-gen-api-key',
          autoComplete: 'new-password',
          spellCheck: false,
          value: text,
          disabled,
          onChange: event => onEdit(event.target.value),
        }),
        h('p', { className: 'dsh-ig-hint' }, hint))
    }

    function ImageGenForm(props) {
      const { credentials, remote, t, onDirtyChange } = props
      const [status, setStatus] = useState('loading')
      const [writable, setWritable] = useState(false)
      const [view, setView] = useState(undefined)
      const [drafts, setDrafts] = useState({ baseURL: '', model: '', editURL: '', timeoutSeconds: '' })
      const [keyDraft, setKeyDraft] = useState('')
      const [keyConfigured, setKeyConfigured] = useState(false)
      const [keyWritable, setKeyWritable] = useState(true)
      const [busy, setBusy] = useState(false)
      const [failure, setFailure] = useState('')
      const [notice, setNotice] = useState('')
      const [dirty, setDirty] = useState(false)
      const dirtyRef = useRef(false)
      const settingsDirtyRef = useRef(false)
      const keyDraftRef = useRef('')
      const dirtyFieldsRef = useRef(new Set())

      const syncDirty = useCallback((settingsDirty, nextKeyDraft) => {
        settingsDirtyRef.current = settingsDirty
        keyDraftRef.current = nextKeyDraft
        setKeyDraft(nextKeyDraft)
        const nextDirty = dirtyOf(settingsDirty, nextKeyDraft)
        setDirty(nextDirty)
        dirtyRef.current = nextDirty
        onDirtyChange?.(nextDirty)
      }, [onDirtyChange])

      const load = useCallback(async (preserveDrafts = false) => {
        setStatus('loading')
        setFailure('')
        try {
          const state = await fetchJson('/image-gen/state')
          setWritable(state.writable === true)
          setView({ value: state.value ?? {}, revision: state.revision ?? 0 })
          if (!preserveDrafts) {
            setDrafts(draftsOf(state.value))
            dirtyFieldsRef.current.clear()
            syncDirty(false, '')
          }
          setStatus('ready')
          try {
            const credResponse = await credentials.describe([keyRefOf(state.value)])
            if (credResponse?.ok) {
              const cred = credResponse.value?.[keyRefOf(state.value)]
              setKeyConfigured(cred?.configured === true)
              setKeyWritable(cred?.writable !== false)
            }
          } catch {
            setKeyConfigured(false)
          }
        } catch (error) {
          setFailure(messageOf(error))
          setStatus('error')
        }
      }, [credentials, syncDirty])

      useEffect(() => {
        void load(false)
        const disposeSettings = remote.$on('settings/document-updated', (ns) => {
          if (ns === NS && !dirtyRef.current) void load(false)
        })
        return () => { disposeSettings() }
      }, [load, remote])

      const editField = (field, text) => {
        setDrafts(current => ({ ...current, [field]: text }))
        dirtyFieldsRef.current.add(field)
        syncDirty(true, keyDraftRef.current)
        setNotice('')
      }

      const editKey = (text) => {
        syncDirty(settingsDirtyRef.current, text)
        setNotice('')
      }

      const save = async () => {
        if (view === undefined || !writable || busy || !dirtyRef.current) return
        if (!isValidBaseUrl(drafts.baseURL) || !isValidBaseUrl(drafts.editURL) || !isValidTimeout(drafts.timeoutSeconds)) return
        setBusy(true)
        setFailure('')
        setNotice('')
        let acceptedView = view
        const plan = savePlan(settingsDirtyRef.current, keyDraftRef.current)
        try {
          if (plan.mutateSettings) {
            try {
              const next = await fetchJson('/image-gen/mutate', {
                ops: opsFor(drafts, dirtyFieldsRef.current),
                expectedRevision: view.revision,
              })
              acceptedView = { value: next.value ?? {}, revision: next.revision ?? 0 }
              setView(acceptedView)
              setDrafts(draftsOf(next.value))
              dirtyFieldsRef.current.clear()
              syncDirty(false, keyDraftRef.current)
            } catch (error) {
              if (error.code === 'settings-conflict') {
                await load(true)
                setFailure(t('conflict'))
              } else {
                setFailure(messageOf(error))
              }
              return
            }
          }

          const key = keyDraftRef.current.trim()
          if (plan.writeKey) {
            try {
              const response = await credentials.set(keyRefOf(acceptedView.value), key)
              if (response !== undefined && response?.ok === false) {
                setFailure(response.error?.message ?? t('saveFailed'))
                return
              }
              setKeyConfigured(true)
            } catch (error) {
              setFailure(messageOf(error))
              return
            }
          }
          // 输入在保存期间禁用，因此成功后可在一个出口原子清空所有草稿标记。
          dirtyFieldsRef.current.clear()
          syncDirty(false, '')
          setNotice(t('saved'))
        } finally {
          setBusy(false)
        }
      }

      if (status === 'loading') {
        return h('div', { className: 'dsh-ig-form' }, h('p', { className: 'dsh-ig-muted' }, t('loading')))
      }
      if (status === 'error') {
        return h('div', { className: 'dsh-ig-form' },
          h('p', { className: 'dsh-ig-error' }, `${t('loadFailed')}: ${failure}`),
          h('button', { className: 'dsh-ig-secondary', type: 'button', onClick: () => void load(false) }, t('refresh')))
      }

      const invalid = !isValidBaseUrl(drafts.baseURL)
        || !isValidBaseUrl(drafts.editURL)
        || !isValidTimeout(drafts.timeoutSeconds)
      return h('div', { className: 'dsh-ig-form' },
        failure ? h('p', { className: 'dsh-ig-error', role: 'alert' }, failure) : null,
        notice ? h('p', { className: 'dsh-ig-success', role: 'status' }, notice) : null,
        !writable ? h('p', { className: 'dsh-ig-muted' }, t('notWritable')) : null,
        h('div', { className: 'dsh-ig-fields' },
          h(KeyField, {
            label: t('apiKey'),
            hint: t('apiKeyHint'),
            text: keyDraft,
            disabled: !writable || busy || !keyWritable,
            configured: keyConfigured,
            stateLabel: keyConfigured ? t('keySet') : t('keyUnset'),
            onEdit: editKey,
          }),
          h(Field, {
            id: 'image-gen-base-url',
            label: t('baseUrl'),
            hint: t('baseUrlHint'),
            text: drafts.baseURL,
            placeholder: 'https://example.com/v1',
            disabled: !writable || busy,
            invalid: !isValidBaseUrl(drafts.baseURL),
            invalidLabel: t('invalidUrl'),
            onEdit: text => editField('baseURL', text),
          }),
          h(Field, {
            id: 'image-gen-model',
            label: t('model'),
            hint: t('modelHint'),
            text: drafts.model,
            placeholder: 'gpt-image-2',
            disabled: !writable || busy,
            invalid: false,
            invalidLabel: '',
            onEdit: text => editField('model', text),
          }),
          h(Field, {
            id: 'image-edit-url',
            label: t('editUrl'),
            hint: t('editUrlHint'),
            text: drafts.editURL,
            placeholder: 'https://example.com/v1/images/edits',
            disabled: !writable || busy,
            invalid: !isValidBaseUrl(drafts.editURL),
            invalidLabel: t('invalidUrl'),
            onEdit: text => editField('editURL', text),
          }),
          h(Field, {
            id: 'image-gen-timeout',
            label: t('timeout'),
            hint: t('timeoutHint'),
            text: drafts.timeoutSeconds,
            placeholder: '180',
            disabled: !writable || busy,
            invalid: !isValidTimeout(drafts.timeoutSeconds),
            invalidLabel: t('invalidNumber'),
            onEdit: text => editField('timeoutSeconds', text),
          })),
        h('div', { className: 'dsh-ig-footer' },
          h('button', {
            type: 'button',
            className: 'dsh-ig-save',
            disabled: !writable || busy || !dirty || invalid,
            onClick: () => void save(),
          }, busy ? t('saving') : t('save'))))
    }

    /**
     * 行配置页的卡片壳（与旧版官方 PluginCard 同形态）：
     * 标题行可点击展开/折叠；折叠时表单保持挂载（hidden），草稿不丢。
     */
    function ImageGenCard(props) {
      const { t } = props
      const [open, setOpen] = useState(false)
      const [dirty, setDirty] = useState(false)
      return h('li', { className: `dsh-ig-card${open ? ' dsh-ig-card-open' : ''}` },
        h('button', {
          type: 'button',
          className: 'dsh-ig-card-header',
          'aria-expanded': open,
          'aria-label': `${open ? t('collapse') : t('expand')}: ${t('nav')}`,
          onClick: () => setOpen(!open),
        },
          h('span', { className: 'dsh-ig-card-headtext' },
            h('span', { className: 'dsh-ig-card-name' }, t('nav')),
            h('span', { className: 'dsh-ig-card-desc' }, t('cardDesc'))),
          dirty ? h('span', { className: 'dsh-ig-card-pending' }, t('unsaved')) : null,
          h('svg', {
            width: 14, height: 14,
            className: `dsh-ig-card-chevron${open ? ' dsh-ig-card-chevron-open' : ''}`,
            viewBox: '0 0 14 14', fill: 'none', xmlns: 'http://www.w3.org/2000/svg',
          },
            h('path', {
              d: 'M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z',
              fill: 'currentColor',
            }))),
        h('div', { className: 'dsh-ig-card-body', hidden: !open },
          h(ImageGenForm, { ...props, onDirtyChange: setDirty })))
    }

    /* ----------------------------- 样式 ----------------------------- */

    const css = `
      /* 卡片壳：值与官方 PluginCard.module.css 完全一致（类名改 dsh-ig- 前缀） */
      .dsh-ig-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background .16s}
      .dsh-ig-card:hover{border-color:var(--dsw-alias-label-dimmed)}
      .dsh-ig-card-open{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
      .dsh-ig-card-header{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px}
      .dsh-ig-card-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
      .dsh-ig-card-headtext{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
      .dsh-ig-card-name{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}
      .dsh-ig-card-desc{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
      .dsh-ig-card-chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}
      .dsh-ig-card-chevron-open{transform:rotate(180deg)}
      .dsh-ig-card-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:14px 0 8px}
      .dsh-ig-card-body[hidden]{display:none}
      .dsh-ig-card-pending{flex:none;border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;font-weight:500;white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
      .dsh-ig-form{display:flex;flex-direction:column;gap:12px;max-width:520px}
      .dsh-ig-fields{display:flex;flex-direction:column;gap:12px}
      .dsh-ig-field{display:flex;flex-direction:column;gap:5px}
      .dsh-ig-field-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .dsh-ig-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
      .dsh-ig-input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;letter-spacing:0}
      .dsh-ig-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
      .dsh-ig-input-invalid{border-color:var(--dsw-alias-label-error)}
      .dsh-ig-input::placeholder{color:var(--dsw-alias-label-tertiary)}
      .dsh-ig-hint,.dsh-ig-invalid{margin:0;font-size:12px;line-height:18px}
      .dsh-ig-hint{color:var(--dsw-alias-label-tertiary)}
      .dsh-ig-invalid{color:var(--dsw-alias-label-error)}
      .dsh-ig-badge{border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;font-weight:500;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
      .dsh-ig-badge-ok{background:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-label-primary-foreground)}
      .dsh-ig-error,.dsh-ig-success,.dsh-ig-muted{margin:0;font-size:12px;line-height:18px}
      .dsh-ig-error{color:var(--dsw-alias-label-error)}
      .dsh-ig-success{color:var(--dsw-alias-state-success-primary)}
      .dsh-ig-muted{color:var(--dsw-alias-label-tertiary)}
      .dsh-ig-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:4px}
      .dsh-ig-save,.dsh-ig-secondary{appearance:none;border:1px solid transparent;border-radius:8px;padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}
      .dsh-ig-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
      .dsh-ig-secondary{border-color:var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary)}
      .dsh-ig-save:disabled,.dsh-ig-secondary:disabled{opacity:.4;cursor:default}
      .dsh-ig-save:focus-visible,.dsh-ig-secondary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
    `
    if (typeof document !== 'undefined') {
      const style = document.createElement('style')
      style.textContent = css
      style.dataset.plugin = 'dsh-image-gen'
      document.head.appendChild(style)
    }

    /* ------------------------------ apply ------------------------------ */

    const inject = ['slots', 'locale', 'remote', 'remote.credentials']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register('settings.imageGen', { zh, en }), 'image-gen: locale')
      const t = ctx.locale.bind('settings.imageGen')
      const credentials = ctx.remote.credentials
      // 注册到 插件 → 已安装 → 本组合包 image-gen 行 的「配置」页。
      // 关键：plugins.row.config 是 keyed slot，key 必须是 `<包名>#<行 id>`（与
      // cordis.patch.yml 的行 id 对应）—— 否则行不会出现「配置」控件。
      // 页面以 view: 'page' 渲染表单；缺少包描述时的 view: 'summary' 只给一句话。
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
        name: 'plugins.row.config',
        key: 'dsh-image-gen#image-gen',
        locale: 'settings.imageGen',
        inject: () => ({ credentials, remote: ctx.remote, t }),
      }, ({ view, ...props }) => (view === 'summary'
        ? h('p', { className: 'dsh-ig-muted' }, props.t('cardDesc'))
        : h(ImageGenCard, props))))
    }

    exports.apply = apply
    exports.inject = inject
    exports.__test = {
      draftsOf,
      dirtyOf,
      isValidBaseUrl,
      isValidTimeout,
      keyRefOf,
      opsFor,
      savePlan,
    }
    return module.exports
  },
})
