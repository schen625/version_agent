import { createThrottledRetry, parseRetryDelayMs, isRetriableError } from "./rateLimit.js";
let fails=0; const ck=(n,c)=>{ if(!c) fails++; console.log(`  ${c?"PASS":"FAIL"}  ${n}`); };
// detection + delay parsing
const err429 = { code:429, message:'... "retryDelay": "3s" ...', status:"RESOURCE_EXHAUSTED" };
ck("429 is retriable", isRetriableError(err429));
ck("503 is retriable", isRetriableError({code:503,status:"UNAVAILABLE"}));
ck("400 is NOT retriable", !isRetriableError({code:400,message:"bad request"}));
ck("parses retryDelay '3s' -> ~3250ms", parseRetryDelayMs(err429,999)===3250);
ck("falls back when no delay present", parseRetryDelayMs({code:429,message:"x"},7777)===7777);
// retry loop: throw 429 twice then succeed (no real waiting)
const waits=[]; const run=createThrottledRetry({minIntervalMs:5000, maxRetries:5, sleepFn:(ms)=>{waits.push(ms);return Promise.resolve();}});
let calls=0;
const out = await run(async()=>{ calls++; if(calls<3) throw {code:429, message:'"retryDelay": "2s"'}; return "ok"; });
ck("recovers after 2×429 -> returns ok", out==="ok");
ck("made exactly 3 attempts", calls===3);
ck("honored server retryDelay (2250ms) on backoff", waits.includes(2250));
// non-retriable throws immediately
let threw=false, calls2=0;
try { await run(async()=>{ calls2++; throw {code:400,message:"nope"}; }); } catch { threw=true; }
ck("non-retriable error propagates", threw && calls2===1);
// exhausts retries then throws
let threw2=false, calls3=0;
try { await run(async()=>{ calls3++; throw {code:429,message:"x"}; }); } catch { threw2=true; }
ck("gives up after maxRetries (6 attempts) then throws", threw2 && calls3===6);
console.log(`\n${fails===0?"ALL RATE-LIMIT CHECKS PASSED":fails+" FAILED"}`);
process.exit(fails===0?0:1);
