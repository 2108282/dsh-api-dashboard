import assert from 'node:assert/strict'
import { MODEL_PRICES, resolveModelPrice, currencyForModel } from '../src/index.js'
const expected={
 'gpt-6.1-sol':{cacheHit:.1,cacheMiss:2,cacheWrite:2.5,output:10},
 'gpt-6-sol':{cacheHit:.2,cacheMiss:2,cacheWrite:2.5,output:10},
 'gpt-6-luna':{cacheHit:.01,cacheMiss:.1,cacheWrite:.125,output:.5},
 'claude-opus-5-5':{cacheHit:.2,cacheMiss:4,cacheWrite:5,output:20},
 'claude-sonnet-5-5':{cacheHit:.1,cacheMiss:2,cacheWrite:2.5,output:10},
 'claude-haiku-5-5':{cacheHit:.01,cacheMiss:.1,cacheWrite:.125,output:.5},
}
const cfg={currency:'CNY',overseasCurrency:'USD'}
for(const [model,price] of Object.entries(expected)){
 assert.deepEqual(MODEL_PRICES[model],price)
 assert.deepEqual(resolveModelPrice(cfg,model),price,'海外原生USD不能再乘汇率')
 assert.equal(currencyForModel(cfg,model),'USD')
 assert.deepEqual(resolveModelPrice(cfg,model+'-20261001'),price,'安全日期后缀保持同价')
 assert.ok(price.cacheHit<price.cacheMiss&&price.cacheWrite>=price.cacheMiss)
 const custom={cacheHit:1,cacheMiss:3,cacheWrite:4,output:7}
 assert.equal(resolveModelPrice({...cfg,prices:{[model]:custom}},model),custom,'手动价格覆盖始终优先')
}
assert.equal(resolveModelPrice(cfg,'gpt-6.1-other').cacheMiss,1,'未知新系列不能被已知Sol键吞掉')
console.log('六个新模型标准档参考价格、缓存读写、原生USD、日期后缀及手动覆盖回归通过；来源层级见docs/PRICING-20261010.md')
