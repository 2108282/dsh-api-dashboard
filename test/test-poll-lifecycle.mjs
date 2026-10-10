import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
const timers = new Map(); let serial = 0, resolves = [], requests = 0, captured
const document = { hidden: false, head: { appendChild() {} }, createElement: () => ({ style: {} }), getElementById: () => null, querySelector: () => ({}) }
const window = { __ModuleLoader__: { load({ factory }) {
  captured = factory(name => name === 'react' ? {} : {})
} } }
const fetch = () => {
  requests++
  return new Promise(resolve => resolves.push(() => resolve({ ok: true, json: async () => ({ balances: [], config: {} }) })))
}
const instrumented = source.replace('    exports.apply = apply;', '    exports.__test = { store, schedule };\n    exports.apply = apply;')
new Function('window', 'document', 'navigator', 'fetch', 'setTimeout', 'clearTimeout', instrumented)(
  window, document, {}, fetch,
  fn => { timers.set(++serial, fn); return serial }, id => timers.delete(id),
)
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const { store, schedule } = captured.__test
let dispose = store.subscribe(() => {})
assert.equal(requests, 1)
dispose(); resolves.shift()(); await flush()
assert.equal(timers.size, 0, '最后订阅离开后在飞请求不能复活定时器')
schedule(); assert.equal(timers.size, 0)
dispose = store.subscribe(() => {})
assert.equal(requests, 2, '重新订阅仍能恢复')
resolves.shift()(); await flush()
assert.equal(timers.size, 1)
const tick = timers.values().next().value; timers.clear(); tick()
assert.equal(requests, 3)
document.hidden = true; resolves.shift()(); await flush()
assert.equal(timers.size, 0, '后台不再调度')
document.hidden = false; schedule(); assert.equal(timers.size, 1)
dispose(); assert.equal(timers.size, 0)
console.log('客户端轮询：在飞卸载 / 重新订阅 / 后台暂停 / 清理定时器，通过')
