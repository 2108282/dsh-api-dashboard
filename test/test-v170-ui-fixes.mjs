import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const source = fs.readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')
let captured, requests = [], timers = new Map(), serial = 0, initialResolve
let server = { scale: 1, volume: .2, peekRatio: .3, left: 40, top: 80, side: 'left' }
const element = () => ({ style: { setProperty(k,v) { this[k]=v }, removeProperty() {} }, classList: { add() {}, remove() {}, contains: () => false }, dataset: {}, children: [],
 setAttribute(k,v) { this[k]=v }, appendChild(n) { this.children.push(n); n.parentNode=this }, removeChild(n) { this.children=this.children.filter(c=>c!==n) }, addEventListener() {}, removeEventListener() {}, contains: () => false,
 getBoundingClientRect: () => ({ left: 20, top: 40, bottom: 60, width: 90, height: 90 }), offsetWidth: 90, offsetHeight: 90 })
const doc = { body: element(), head: element(), documentElement: element(), createElement: element, querySelector: () => ({}), getElementById: () => null, addEventListener() {}, removeEventListener() {}, hidden: false }
const react = { createElement: (type, props, ...children) => ({ type, props: props||{}, children:children.flat(Infinity).filter(x=>x!==null&&x!==false&&x!==undefined) }), useState: v => [v,()=>{}], useRef: v=>({current:v}), useEffect() {}, useCallback:f=>f, useSyncExternalStore: (s,g)=>g() }
const window = { innerWidth: 360, innerHeight: 754, addEventListener() {}, removeEventListener() {}, __ModuleLoader__: { load({factory}) { captured=factory(name=>name==='react'?react:name==='react-dom'?{createPortal:(node,target)=>({node,target})}:{}) } } }
const fetch = async (url,opts) => {
 if (url === '/api-dashboard/whale/settings') {
  if (!opts?.method) return new Promise(resolve=>{initialResolve=()=>resolve({ok:true,json:async()=>({ok:true,settings:{scale:1,volume:.2,peekRatio:.3,left:40,top:80,side:'left'}})})})
  const body=JSON.parse(opts.body);requests.push(body);server={...server,...body}; return {ok:true,json:async()=>({ok:true,settings:server})}
 }
 return {ok:true,json:async()=>({ok:true})}
}
const instrumented=source.replace('    exports.apply = apply;','    exports.__test = { acquireWhaleWidget, releaseWhaleWidget, patchWhaleWidget, saveWhalePatch, saveVerified, buildSubagentRow, showSubagentTip, DashboardDrawer, overlayToBody, setSnapshot: v=>{snapshot=v}, last:()=>lastWhaleSettings, store };\n    exports.apply = apply;')
new Function('window','document','navigator','localStorage','fetch','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame','Audio',instrumented)(window,doc,{}, {getItem:()=>'',setItem(){}},fetch,fn=>{timers.set(++serial,fn);return serial},id=>timers.delete(id),fn=>{fn();return 1},()=>{},class {play(){return Promise.resolve()}})
const T=captured.__test;const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve()}
// 真实失败语义：POST已提交后回复丢失，只回查，不再写一次。
for (const select of [d=>d.settings,d=>d]) {
 let writes=0,reads=0,stored={};
 const transport=async(url,opts)=>{
  if(opts.method==='POST'){writes++;stored=JSON.parse(opts.body);throw new TypeError('Failed to fetch')}
  reads++;return {ok:true,json:async()=>select({settings:stored})===stored?{ok:true,settings:stored}:{ok:true,...stored}}
 }
 const d=await T.saveVerified('/fixture',{scale:.75},select,transport)
 assert.equal(d.verifiedByReadback,true);assert.equal(writes,1);assert.equal(reads,1)
}
let writes=0,reads=0
const miss=async(url,opts)=>{if(opts.method==='POST'){writes++;throw new TypeError('Failed to fetch')};reads++;return {ok:true,json:async()=>({ok:true,settings:{scale:1}})}}
// 给150ms只读等待独立即时定时器，实际写入次数仍只能一次。
const noWriteBack=T.saveVerified('/fixture',{scale:.75},d=>d.settings,miss)
for(let i=0;i<50;i++){await flush();for(const [id,fn] of [...timers]){timers.delete(id);fn()}}
await assert.rejects(noWriteBack,/返回值与目标不一致.*未确认保存/);assert.equal(writes,1);assert.equal(reads,3)
reads=0
await assert.rejects(T.saveVerified('/fixture',{scale:.75},d=>d.settings,async(url,opts)=>{if(!opts.method)reads++;return {ok:false,status:500,json:async()=>({ok:false,error:'settings-save-failed'})}}),/HTTP 500/)
assert.equal(reads,0,'明确500拒绝不能被回查当成成功')

T.acquireWhaleWidget(); T.patchWhaleWidget({scale:1.8}); await T.saveWhalePatch({scale:1.8}); initialResolve(); await flush()
assert.equal(T.last().scale,1.8,'旧初始化回包不得覆盖已改scale')
assert.equal(T.last().volume,.2,'未编辑字段仍取服务器真值')
assert.equal(T.last().peekRatio,.3)
for(const [id,fn] of [...timers]) {timers.delete(id);fn()}await flush()
assert.equal(server.scale,1.8,'位置保存不得覆盖scale')
requests.slice(1).forEach(body=>assert.ok(!('scale' in body),'位置PUT只能写位置'))
const a=T.saveWhalePatch({scale:1.2}),b=T.saveWhalePatch({scale:2.1});await Promise.all([a,b]);assert.equal(server.scale,2.1,'串行保存最后值优先')
T.releaseWhaleWidget();T.acquireWhaleWidget();assert.equal(T.last().scale,1.8,'缓存立即更新不被dispose丢弃');T.releaseWhaleWidget()
const row=T.buildSubagentRow({currency:'USD',subagents:[{id:'a',label:'审计',cost:1,costByCurrency:{USD:1},models:['gpt']} ]})
assert.equal(row.children[0].type,'button');assert.equal(row.children[0].props.type,'button')
assert.equal(T.overlayToBody({test:1}).target,doc.body)
T.setSnapshot({status:'ok',balances:[{platform:'x',category:'海外',status:'no-key'}],config:{},fetchedAt:1})
const cost={currency:'USD',subagents:[{id:'a',label:'审计',cost:1,costByCurrency:{USD:1},models:['gpt']}]}
const flatten=n=>n&&typeof n==='object'?[n,...(n.children||[]).flatMap(flatten)]:[]
const drawer=config=>T.DashboardDrawer({isOpen:true,t:k=>k,config,subagentCost:cost})
assert.ok(flatten(drawer({showSubagentCapsules:false}).node).some(n=>n.props.className==='dshadb_session_subagents'),'关闭胶囊后移到看板')
assert.ok(!flatten(drawer({showSubagentCapsules:true}).node).some(n=>n.props.className==='dshadb_session_subagents'),'开启胶囊时看板不重复')
// 实际主槽位渲染，不能只给Drawer手工塞props，防遗漏再发生。
let slot
captured.apply({effect(){}, slots:{inject(n,fn){fn()},register(def,fn){slot=fn;return()=>{}}},modelDirectories:{}})
const oldState=react.useState
react.useState=v=>[v==='bar'?'list':typeof v==='function'?v():v,()=>{}]
T.setSnapshot({status:'ok',balances:[],config:{showSubagentCapsules:false},fetchedAt:1})
const main=slot({t:k=>k,useProjection:()=>cost})
const child=flatten(main).find(n=>n.type===T.DashboardDrawer)
assert.equal(child.props.subagentCost,cost,'主槽位必须传入真实cost')
assert.ok(flatten(T.DashboardDrawer(child.props).node).some(n=>n.props.className==='dshadb_session_subagents'))
react.useState=oldState
assert.match(source,/dshadb_drawer\{[^}]*height:auto/,'看板跟随内容高度')
assert.match(source,/body\.dshadb-whale-preview \.dshadb-whale\{z-index:100003/,'仅设置预览时挂件可见')
assert.match(source,/background: "#4176e6", color: "#fff"/,'保存按钮不反转成浅色')

T.showSubagentTip(element(),'子代理 审计\n自身消耗 $1.00\n模型 gpt\nID 1234')
const tip=doc.body.children.at(-1);assert.equal(tip.children[0].textContent,'子代理 审计');assert.equal(tip.children[1].className,'dshadb_subtip_row')
assert.match(source,/body\[data-ds-dark-theme\]/);assert.match(source,/background-size:5px 5px!important/)
assert.ok(!source.includes('timer = setTimeout(() => { timer = 0; fired = true;'))
assert.match(source,/margin:-12px auto 0/)

const home=fs.mkdtempSync(path.join(os.tmpdir(),'dshadb-ui170-'));const old=process.env.DSH_HOME;process.env.DSH_HOME=home
try {
 const m=await import('../src/index.js')
 const fixture=`- id: llm-deepseek\n  name: "@deepseek-ai/dsh-llm-deepseek-api-key"\n  config:\n    apiKeyEnv: CUSTOM_OFFICIAL_KEY\n`
 assert.equal(m.parseOfficialDeepSeekRef(fixture),'CUSTOM_OFFICIAL_KEY')
 assert.equal(m.parseOfficialDeepSeekRef(fixture+'    baseURL: https://relay.example/v1\n'),'')
 const routes=[];const ctx={get(){},effect(){},inject(names,fn){if(names[0]==='webServer')fn({effect:fn=>fn(),webServer:{register(r){routes.push(r);return()=>{}}}});if(names[0]==='connection')fn({connection:{requestRejection:()=>undefined}})}}
 m.apply(ctx,{presets:[]})
 const route=routes.find(r=>r.path==='/api-dashboard/whale/settings')
 const req=body=>({method:'PUT',async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body))}})
 const res=()=>({code:null,body:null,writeHead(c){this.code=c},end(b){this.body=JSON.parse(b)}})
 let r=res();await route.handler(req({scale:1.8}),r);assert.equal(r.code,200)
 r=res();await route.handler(req({left:90}),r);assert.equal(r.body.settings.scale,1.8)
 assert.equal(JSON.parse(fs.readFileSync(path.join(home,'dsh-api-dashboard.json'),'utf8')).whaleSettings.scale,1.8)
 const configRoute=routes.find(r=>r.path==='/api-dashboard/config');r=res();await configRoute.handler({...req({showSubagentCapsules:false}),method:'POST'},r)
 assert.equal(JSON.parse(fs.readFileSync(path.join(home,'dsh-api-dashboard.json'),'utf8')).showSubagentCapsules,false)
 const blocker=path.join(home,'dsh-api-dashboard.json.tmp');fs.mkdirSync(blocker)
 r=res();await route.handler(req({scale:2.3}),r);assert.equal(r.code,500,'写盘失败必须报错')
 r=res();await route.handler({method:'GET'},r);assert.equal(r.body.settings.scale,1.8,'写盘失败不提交runtime')
 console.log('UI修复：body portal、单击分行详情、宿主主题、紧凑间距、大小竞态/串行/位置独立保存、磁盘失败、子代理开关、官方凭据引用测试通过')
}finally{if(old===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=old;assert.ok(home.startsWith(path.join(os.tmpdir(),'dshadb-ui170-')));fs.rmSync(home,{recursive:true,force:true})}
