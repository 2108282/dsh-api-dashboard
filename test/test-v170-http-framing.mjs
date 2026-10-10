import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
const home=fs.mkdtempSync(path.join(os.tmpdir(),'dshadb-http-frame-'))
const oldHome=process.env.DSH_HOME; process.env.DSH_HOME=home
const previousInfo=console.info;console.info=()=>{}
let server,restore=()=>{}
try {
 const m=await import('../src/index.js')
 const compression=await import('/root/dsha-web-mobile/lib/compress.js').catch(()=>null)
 const routes=[]
 m.apply({get(){},effect(){},inject(names,fn){
  if(names[0]==='webServer')fn({effect:fn=>fn(),webServer:{register(r){routes.push(r);return()=>{}}}})
  if(names[0]==='connection')fn({connection:{requestRejection:()=>undefined}})
 }},{presets:[]})
 const outcomes=[]
 server=createServer((req,res)=>{
  res.once('finish',()=>outcomes.push({path:req.url,finished:true,status:res.statusCode}))
  const route=routes.find(r=>r.path===req.url)
  if(!route){res.writeHead(404);res.end();return}
  route.handler(req,res).catch(error=>{res.writeHead(500);res.end();throw error})
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 if(compression)restore=compression.installResponseCompression({matches:req=>req.socket?.localPort===server.address().port})
 const base='http://127.0.0.1:'+server.address().port
 for(let i=0;i<12;i++) {
  const scale=.6+i*.05
  for(const [url,opts] of [['/api-dashboard/whale/settings',{method:'POST',body:JSON.stringify({scale})}],['/api-dashboard/config',{method:'POST',body:JSON.stringify({showSubagentCapsules:i%2===0})}],['/api-dashboard/whale/settings',{}],['/api-dashboard/config',{}]]) {
   const r=await fetch(base+url,{...opts,headers:{'Content-Type':'application/json','accept-encoding':'gzip, deflate, br, zstd'},signal:AbortSignal.timeout(3000)})
   assert.equal(r.status,200)
   assert.match(r.headers.get('cache-control'),/no-transform/)
   assert.equal(r.headers.get('content-encoding'),null)
   const raw=await r.text()
   assert.equal(Buffer.byteLength(raw),Number(r.headers.get('content-length')))
   const d=JSON.parse(raw);assert.equal(d.ok,true)
   if(url.endsWith('whale/settings'))assert.ok(Math.abs(d.settings.scale-scale)<1e-8)
  }
 }
 assert.equal(outcomes.length,48)
 assert.ok(outcomes.every(o=>o.finished&&o.status===200))
 console.log('真实HTTP响应链路：48次读写、原始字节/Content-Length、正常finish、'+(compression?'当前宿主压缩钩子':'无移动宿主压缩钩子')+'通过；不等同真机验收')
}finally{
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
 restore();console.info=previousInfo
 if(oldHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=oldHome
 assert.ok(home.startsWith(path.join(os.tmpdir(),'dshadb-http-frame-')));fs.rmSync(home,{recursive:true,force:true})
}
