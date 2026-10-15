// 本机 0.2.0 修复回归：纯夹具，不读私有凭证，不调设备/外部平台。
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
const home = mkdtempSync(join(tmpdir(), 'dshadb-020-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = home
const originalFetch = globalThis.fetch
try {
  const m = await import('../src/index.js')
  const require = createRequire(import.meta.url)
  const { evaluatePluginCompatibility } = await import('@deepseek-ai/dsh-app-boot')
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(evaluatePluginCompatibility(pkg, {}, '0.2.0-rc.2'), undefined)
  assert.equal(evaluatePluginCompatibility(pkg, {}, '0.2.0'), undefined)
  assert.equal(evaluatePluginCompatibility(pkg, {}, '0.1.7-rc.2'), undefined)
  assert.ok(evaluatePluginCompatibility(pkg, {}, '0.3.0'))

  // 当前 schema 必须持久化 own.byDay；fork 今日汇总只加新用量。
  const p = m.makeCostProjection({ currency: 'CNY', overseasCurrency: 'USD' })
  const now = Date.now()
  const context = seq => ({ seq, time: now, type: 'request/context', data: { model: 'mimo-v2.5' } })
  const usage = (seq, inputTokens) => ({ seq, time: now, type: 'assistant/message', data: { turn: seq, step: 1, usage: { inputTokens } } })
  let parent = p.apply(p.init({ id: 'parent' }, 0), context(0))
  parent = p.apply(parent, usage(1, 1000000))
  let fork = p.apply(p.init({ id: 'fork', isSeeded: true }, 2), context(0))
  fork = p.apply(fork, usage(1, 1000000))
  fork = p.apply(fork, usage(2, 2000000))
  fork = p.stateSchema.parse(fork)
  assert.ok(fork.own.byDay)
  assert.equal(p.apply(fork, { type: 'tool/result', data: {} }), fork, '无关事件保持引用')
  const liveP = m.makeCostProjection({ currency: 'CNY', overseasCurrency: 'USD' }, {
    sessions: { list: () => [{ id: 'parent', state: parent }, { id: 'fork', state: fork }] },
    projections: { stateOf: s => s.state },
  })
  assert.equal(liveP.wire.view(parent).todayByCurrency.CNY, 3, '父 1 元 + fork 自身 2 元，非 4 元')

  // 冷 fork v4/v5/v6 都读 own，未知版本不盲读；峰谷价跟事件时刻而非查看时刻。
  const dir = join(home, 'storages/session_projcache/sessions')
  mkdirSync(dir, { recursive: true })
  let child = p.apply(p.init({ id: 'child', isSeeded: true }, 2), context(0))
  child = p.apply(child, usage(1, 1000000))
  child = p.apply(child, { seq: 2, time: Date.UTC(2026,8,22,5), type: 'request/context', data: { model: 'deepseek-v4-pro' } })
  child = p.apply(child, { seq: 3, time: Date.UTC(2026,8,22,5), type: 'assistant/message', data: { turn: 2, step: 1, usage: { inputTokens: 1000000 } } })
  const ids = ['v4', 'v5', 'v6', 'future']
  ids.forEach((id, i) => writeFileSync(join(dir, id + '.json'), JSON.stringify({ record: {
    identity: { inheritedEventCount: 2 }, rows: { queryBalanceCost: { ver: [4,5,6,99][i], val: child } },
  } })))
  writeFileSync(join(dir, 'root.json'), JSON.stringify({ record: { rows: { subagentCatalog: { val: { head: { values: ids.map(childId => ({ childId })) } } } } } }))
  const root = p.init({ id: 'root' }, 0); root.ownChildIds = ids
  const rows = p.wire.view(root).subagents
  rows.slice(0,3).forEach(row => {
    assert.equal(row.waiting, false)
    assert.equal(row.tokens.uncachedInput, 1000000)
    assert.equal(row.cost, 4.5, '按现有价格表，1M pro 谷时输入 = 4.5 元')
  })
  assert.equal(rows[3].waiting, true)

  // 用真实响应流验证：头先返回、body 永远不结束，必须仍然超时。
  const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  const fetchBlock = source.slice(source.indexOf('async function fetchWithTimeout('), source.indexOf('/** 读取请求体'))
  const fetchWithTimeout = new Function(fetchBlock + ';return fetchWithTimeout')()
  const http = createServer((req, res) => { res.writeHead(200); res.write('{"partial":'); })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  try {
    const res = await fetchWithTimeout('http://127.0.0.1:' + http.address().port, {}, 150)
    await assert.rejects(res.text(), /abort|timeout/i)
  } finally { http.closeAllConnections(); await new Promise(resolve => http.close(resolve)) }

  // 鉴权缺失/throw 必须拒绝，正常 401/403 语义保持；不实际启动插件服务。
  const effects = [], routes = [], injections = []
  const web = { effect(fn) { effects.push(fn); return fn() }, webServer: { register(route) { routes.push(route); return () => {} } } }
  const ctx = { get() {}, effect(fn) { effects.push(fn) }, inject(names, fn) {
    if (names[0] === 'webServer') fn(web)
    if (names[0] === 'connection') injections.push(fn)
  } }
  m.apply(ctx, { presets: [], refreshIntervalMs: 1000 })
  const balancesRoute = routes.find(r => r.path === '/api-dashboard/balances')
  const request = { method: 'HEAD', url: '/api-dashboard/balances', headers: {} }
  const response = () => ({ code: null, writeHead(code) { this.code = code }, end() {} })
  let res = response(); await balancesRoute.handler(request, res); assert.equal(res.code, 503)
  injections[0]({ connection: { requestRejection() { throw Error('boom') } } })
  res = response(); await balancesRoute.handler(request, res); assert.equal(res.code, 503)
  for (const code of [401, 403]) {
    injections[0]({ connection: { requestRejection: () => code } })
    res = response(); await balancesRoute.handler(request, res); assert.equal(res.code, code)
  }
  const disposeConnection = injections[0]({ connection: { requestRejection: () => undefined } })
  res = response(); await balancesRoute.handler(request, res); assert.equal(res.code, 200)
  disposeConnection(); res = response(); await balancesRoute.handler(request, res); assert.equal(res.code, 503)
  assert.ok(!/['"&?]token=/.test(source), '设备桥凭据不在 URL')

  // 在飞刷新期间卸载：旧 finally 不复活服务端计时器。
  const oldSet = globalThis.setTimeout, oldClear = globalThis.clearTimeout
  const timers = new Map(); let serial = 0
  globalThis.setTimeout = fn => { timers.set(++serial, fn); return serial }
  globalThis.clearTimeout = id => timers.delete(id)
  try {
    const dispose = effects[0]()
    const fn = timers.values().next().value; timers.clear(); fn(); dispose()
    for (let i = 0; i < 20; i++) await Promise.resolve()
    assert.equal(timers.size, 0, '服务端卸载不复活轮询')
  } finally { globalThis.setTimeout = oldSet; globalThis.clearTimeout = oldClear }
  console.log('0.2.0 兼容 / fork 去重 / 冷缓存版本与峰谷 / 慢 body 超时 / 鉴权 fail-closed / 服务端轮询卸载：通过')
} finally {
  globalThis.fetch = originalFetch
  if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome
  rmSync(home, { recursive: true, force: true })
}
