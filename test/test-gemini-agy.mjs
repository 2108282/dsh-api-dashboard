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
  src = src.replace(marker, `    exports.__test = { modelToPlatform, isRelayProvider, barAmountText, formatMoney, whaleQuotaLines, updateWhaleContext };\n` + marker)
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

  // 1.2 大肥鱼宠物配额与重置时间气泡生成测试 (新规范: 当前账号、5h配额、周配额)
  T.updateWhaleContext({
    quota: {
      platform: 'gemini',
      name: 'Google Gemini',
      status: 'ok',
      total: 55,
      currency: '%',
      percent: 55,
      resetAt: '2026-09-13T04:16:01Z',
      account: 'user@example.com',
      h5Quota: { percent: 55, resetTime: '2026-09-13T04:16:01Z' },
      weeklyQuota: { percent: 88, resetTime: '2026-09-20T04:16:01Z' },
    },
  })
  const qLines = T.whaleQuotaLines()
  a('大肥鱼气泡生成 3 行结构', Array.isArray(qLines) && qLines.length === 3)
  a('大肥鱼气泡第1行包含当前账号', qLines[0].t.includes('user@example.com'))
  a('大肥鱼气泡第2行包含5h配额数值55%与重置时间', qLines[1].t.includes('5h') && qLines[1].t.includes('55%') && qLines[1].t.includes('04:16'))
  a('大肥鱼气泡第3行包含周配额数值88%', qLines[2].t.includes('周') && qLines[2].t.includes('88%'))

  globalThis.fetch = originalFetch
}

// 2. 测试服务端 queryGeminiBalance 逻辑
{
  const indexMod = await import(fileURLToPath(new URL('../src/index.js', import.meta.url)) + '?t=' + Date.now())
  const { queryGeminiBalance, extractAgyAccountQuota, PLATFORM_PRESETS } = indexMod
  const geminiPreset = PLATFORM_PRESETS.find((p) => p.id === 'gemini')

  a('PLATFORM_PRESETS 包含 gemini', !!geminiPreset)
  a('gemini 的 queryType 为 gemini', geminiPreset?.queryType === 'gemini')
  a('gemini noBalance 标志已解除', geminiPreset?.noBalance !== true)

  // 2.0 extractAgyAccountQuota 纯函数测试
  const qFromLimits = extractAgyAccountQuota({
    cachedLimits: {
      groups: [
        {
          name: 'Gemini Models',
          windows: [
            { bucketId: 'gemini-5h', window: '5h', remainingFraction: 0.654, resetTime: '2026-09-24T18:00:00Z' },
            { bucketId: 'gemini-weekly', window: 'weekly', remainingFraction: 0.95, resetTime: '2026-09-30T00:00:00Z' },
          ],
        },
      ],
    },
  })
  a('extractAgyAccountQuota 成功解析 0.3.1 cachedLimits 5h窗口', qFromLimits?.percent === 65 && qFromLimits?.remainingFraction === 0.654)
  a('extractAgyAccountQuota 提取重置时间正确', qFromLimits?.resetTime === '2026-09-24T18:00:00Z')

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

    // 2.2b 本地 agy-accounts.json 0.3.1 新版 cachedLimits 直读场景 (无 cachedQuota)
    const mockAgy031Data = {
      version: 4,
      activeIndex: 0,
      accounts: [
        {
          email: '031user@example.com',
          enabled: true,
          cachedLimits: {
            groups: [
              {
                name: 'Gemini Models',
                windows: [
                  { bucketId: 'gemini-5h', window: '5h', remainingFraction: 0.21315, resetTime: '2026-09-24T12:08:17Z' },
                  { bucketId: 'gemini-weekly', window: 'weekly', remainingFraction: 0.789, resetTime: '2026-09-30T03:05:32Z' },
                ],
              },
            ],
            updatedAt: Date.now(),
          },
        },
      ],
    }
    writeFileSync(path.join(tmpHome, 'agy-accounts.json'), JSON.stringify(mockAgy031Data))
    const agy031Res = await queryGeminiBalance(geminiPreset, '', { dshHome: tmpHome, agyApiUrl: 'http://127.0.0.1:9999/none', timeoutMs: 100 })
    a('0.3.1 cachedLimits 直读成功 status === ok', agy031Res.status === 'ok')
    a('0.3.1 cachedLimits 百分比 total === 21', agy031Res.total === 21)
    a('0.3.1 cachedLimits 包含 031 邮箱与百分比', agy031Res.note.includes('21%') && agy031Res.note.includes('031user@example.com'))
    a('0.3.1 cachedLimits resetAt 存在', !!agy031Res.resetAt)

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
