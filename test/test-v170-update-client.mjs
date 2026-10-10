import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
let captured, states = [], cursor = 0, installs = 0
const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(x => x != null && x !== false) }),
  useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v }] },
  useRef: v => ({ current: v }), useEffect() {}, useCallback: fn => fn }
const win = { __ModuleLoader__: { load({ factory }) { captured = factory(name => name === 'react' ? react : {}) } } }
const doc = { querySelector: () => ({}), addEventListener() {}, removeEventListener() {} }
new Function('window', 'document', 'navigator', src.replace('    exports.apply = apply;', '    exports.__test = { updateCanInstall, UpdateDetails, SettingsModal, zh, en };\n    exports.apply = apply;'))(win, doc, {})
const T = captured.__test, t = k => T.zh[k] || k
const info = { ok: true, hasUpdate: true, canInstall: true, current: '1.7.0', remote: '1.8.0', summary: '<img onerror=evil()>\n更新说明', confirmationToken: 'a'.repeat(64), compatibility: { status: 'compatible', runtimeVersion: '0.2.0-rc.2', targets: ['手机/平板/桌面'], requirements: [{ name: '@deepseek-ai/dsh', range: '^0.2.0-rc.2' }] } }
const flat = n => !n || typeof n !== 'object' ? [] : [n, ...n.children.flatMap(flat)]
for (const status of ['compatible', 'incompatible', 'unknown']) {
  const d = { ...info, compatibility: { ...info.compatibility, status } }
  const tree = T.UpdateDetails({ info: d, t, busy: false, onClose() {}, onInstall() { installs++ } })
  const nodes = flat(tree)
  assert.ok(nodes.some(n => n.props.role === 'dialog'))
  assert.ok(!nodes.some(n => n.props['aria-modal'] || n.props.dangerouslySetInnerHTML), '不执行远端HTML，不触发宿主modal重排')
  assert.ok(nodes.some(n => n.children.includes(info.summary)), '摘要纯文本渲染')
  const button = nodes.find(n => n.props.key === 'install')
  assert.equal(button.props.disabled, status !== 'compatible')
  button.props.onClick()
}
assert.equal(installs, 1, '不兼容/未知即使直接调用onClick也不能安装')
assert.equal(T.updateCanInstall({ ...info, confirmationToken: '' }), false)
assert.equal(T.updateCanInstall({ ...info, canInstall: false }), false)
const busy = flat(T.UpdateDetails({ info, t, busy: true, onClose() {}, onInstall() {} }))
assert.equal(busy.find(n => n.props.key === 'install').props.disabled, true)
const keys = Object.keys(T.zh).filter(k => k.startsWith('update.'))
keys.forEach(k => assert.ok(T.en[k], k + '英文文案缺失'))
assert.match(src, /setUpdateDetailsOpen\(true\)/, '发现更新打开弹窗')
assert.match(src, /onClick: \(\) => setUpdateDetailsOpen\(true\)/, '设置按钮只查看详情')
assert.match(src, /expectedVersion: upd\.info\.remote, confirmationToken: upd\.info\.confirmationToken/, '提交确认版本')
console.log('更新弹窗：兼容/不兼容/未知禁用、直接点击防护、纯文本摘要、busy、双语和确认接线通过')
