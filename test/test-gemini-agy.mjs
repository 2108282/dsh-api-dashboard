import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

let pass = 0, fail = 0
const a = (n, c, extra) => {
  if (c) {
    pass++
  } else {
    fail++
    console.log('FAIL ' + n + (extra ? ' ' + extra : ''))
  }
}

// 1. 测试客户端 isRelayProvider 与 modelToPlatform 对 agy / gemini 的判定
const originalFetch = globalThis.fetch
{
  const react = {
    createElement: () => ({}),
    useState: (i) => [i, () => {}],
    useRef: (i) => ({ current: i }),
    useEffect: () => {},
    useMemo: (f) => f(),
    useCallback: (f) => f,
    useSyncExternalStore: (s, g) => g(),
  }
  const doc = {
    head: { appendChild() {} },
    body: { appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {}, contains: () => true },
    documentElement: { classList: { add() {} } },
    createElement: () => ({ dataset: {}, classList: { add() {}, remove() {}, contains: () => false }, style: { setProperty() {}, removeProperty() {} }, appendChild() {} }),
    addEventListener() {},
    removeEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    hidden: false,
  }
  globalThis.document = doc
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 412,
    innerHeight: 892,
    location: { origin: 'http://x' },
    confirm: () => false,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  }
  globalThis.localStorage = { getItem: () => '', setItem() {} }
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })
  globalThis.Audio = class { constructor() { this.volume = 0 } play() { return Promise.resolve() } }
  globalThis.requestAnimationFrame = (f) => { f(0); return 1 }
  globalThis.cancelAnimationFrame = () => {}

  let captured = null
  globalThis.window.__ModuleLoader__ = {
    load({ factory }) {
      captured = factory((n) => {
        if (n === 'react') return react
        if (n === '@deepseek-ai/dsh-client-ui-primitives') return {}
        throw new Error('未知依赖 ' + n)
      })
    },
  }

  let src = readFileSync(fileURLToPath(new URL('../client/client.js', import.meta.url)), 'utf8')
  const marker = '    exports.apply = apply;'
  src = src.replace(marker, `    exports.__test = { modelToPlatform, isRelayProvider, barAmountText, formatMoney };\n` + marker)
  new Function('window', 'document', 'navigator', 'localStorage', src)(globalThis.window, doc, { hardwareConcurrency: 8, language: 'zh-CN' }, globalThis.localStorage)
  const T = captured.__test

  a('isRelayProvider agy 判定为官方直连', T.isRelayProvider('agy', {}) === false)
  a('isRelayProvider antigravity 判定为官方直连', T.isRelayProvider('antigravity', {}) === false)
  a('isRelayProvider 普通中转站仍判定为 relay', T.isRelayProvider('my-custom-relay', {}) === true)
  a('modelToPlatform gemini-3.8-flash-tiered → gemini', T.modelToPlatform('gemini-3.8-flash-tiered') === 'gemini')
  a('modelToPlatform gemini-2.5-pro → gemini', T.modelToPlatform('gemini-2.5-pro') === 'gemini')
  a('formatMoney 70% 格式化正确', T.formatMoney(70, '%') === '70%')
  a('barAmountText ok状态下显示百分比', T.barAmountText({ status: 'ok', total: 70, currency: '%' }, (k) => k, false) === '70%')
  a('barAmountText viaRelay 时仍显示中转横杠', T.barAmountText({ status: 'ok', total: 70, currency: '%' }, (k) => k, true) === '—')
  globalThis.fetch = originalFetch
}

// 2. 测试服务端 queryGeminiBalance 逻辑
{
  const indexMod = await import(fileURLToPath(new URL('../src/index.js', import.meta.url)) + '?t=' + Date.now())
  const { queryGeminiBalance, PLATFORM_PRESETS } = indexMod
  const geminiPreset = PLATFORM_PRESETS.find((p) => p.id === 'gemini')

  a('PLATFORM_PRESETS 包含 gemini', !!geminiPreset)
  a('gemini 的 queryType 为 gemini', geminiPreset?.queryType === 'gemini')
  a('gemini noBalance 标志已解除', geminiPreset?.noBalance !== true)

  // 2.1 既无 key 也无 agy 账号场景
  const tmpHome = path.join(os.tmpdir(), 'dshadb-test-gemini-' + Date.now())
  mkdirSync(tmpHome, { recursive: true })

  try {
    const noKeyRes = await queryGeminiBalance(geminiPreset, '', { dshHome: tmpHome, agyApiUrl: 'http://127.0.0.1:9999/none', timeoutMs: 100 })
    a('无 key 无 agy 时返回 no-key', noKeyRes.status === 'no-key')

    // 2.2 本地 agy-accounts.json 缓存直读场景
    const mockAgyData = {
      version: 4,
      activeIndex: 0,
      accounts: [
        {
          email: 'test@example.com',
          enabled: true,
          cachedQuota: {
            google: {
              remainingFraction: 0.825,
              resetTime: '2026-09-13T06:00:00Z',
              modelCount: 20,
            },
          },
        },
      ],
    }
    writeFileSync(path.join(tmpHome, 'agy-accounts.json'), JSON.stringify(mockAgyData))

    const agyCachedRes = await queryGeminiBalance(geminiPreset, '', { dshHome: tmpHome, agyApiUrl: 'http://127.0.0.1:9999/none', timeoutMs: 100 })
    a('agy 缓存直读成功 status === ok', agyCachedRes.status === 'ok')
    a('agy 缓存直读百分比 total === 83', agyCachedRes.total === 83)
    a('agy 缓存直读币种 currency === %', agyCachedRes.currency === '%')
    a('agy 缓存直读 resetAt 正确', agyCachedRes.resetAt === '2026-09-13T06:00:00Z')
    a('agy 缓存直读 note 包含邮箱与百分比', agyCachedRes.note.includes('83%') && agyCachedRes.note.includes('test@example.com'))

    // 2.3 账号禁用场景
    mockAgyData.accounts[0].enabled = false
    mockAgyData.accounts[0].cachedQuota.google.remainingFraction = 0
    writeFileSync(path.join(tmpHome, 'agy-accounts.json'), JSON.stringify(mockAgyData))
    const agyExhaustedRes = await queryGeminiBalance(geminiPreset, '', { dshHome: tmpHome, agyApiUrl: 'http://127.0.0.1:9999/none', timeoutMs: 100 })
    a('agy 耗尽或不可用时 status === error', agyExhaustedRes.status === 'error')
  } finally {
    rmSync(tmpHome, { recursive: true, force: true })
  }

  // 2.4 真实宿主环境探测实测
  try {
    const liveRes = await queryGeminiBalance(geminiPreset, '', { timeoutMs: 3000 })
    console.log('liveRes:', liveRes)
    if (liveRes.status === 'ok') {
      a('真实环境与 dsh-agy 联动成功 (status=ok)', true)
      a('真实环境配额为百分比型', liveRes.currency === '%')
      a('真实环境配额在合法范围 [0, 100]', liveRes.total >= 0 && liveRes.total <= 100)
      console.log('真实环境获取到的 Gemini 配额:', liveRes.note)
    } else {
      console.log('真实环境未启用 agy 或获取失败:', liveRes.status, liveRes.error)
    }
  } catch (e) {
    console.log('真实环境探测抛错:', e.message)
  }
}

console.log(`\n测试结果: ${pass} 通过, ${fail} 失败`)
if (fail > 0) process.exitCode = 1
