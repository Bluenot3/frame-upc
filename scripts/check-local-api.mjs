import assert from 'node:assert/strict';
const origin='http://127.0.0.1:4320';
const signIn=await fetch(origin+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});
const cookie=signIn.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie,'Local mock sign-in is available');
async function request(path,data,extra={}){const response=await fetch(origin+path,{method:'POST',headers:{origin,cookie,'content-type':'application/json',...extra},body:JSON.stringify(data)});const raw=await response.text();let body;try{body=JSON.parse(raw);}catch{body={error:raw};}return {status:response.status,body};}
assert.equal((await request('/api/orders',{action:'search'},{cookie:''})).status,401);
assert.equal((await request('/api/orders',{action:'search'},{origin:'https://unrelated.example'})).status,403);
assert.equal((await request('/api/orders',{action:'search'},{cookie:'','oai-authenticated-user-id':'local_seedy','oai-authenticated-user-email':'seedy@sites.test'})).status,401);
const id=crypto.randomUUID(),order={patient:'API Test Person',reference:'TEST-'+id,upc:'012345678905',lab:'Example Lab',orderedOn:'2026-09-21',dueOn:'2026-09-20',status:'Received',notes:'Synthetic local test only'};
let result=await request('/api/orders',{action:'create',id,order});assert.equal(result.status,200);assert.equal(result.body.order.version,1);assert.equal(result.body.order.owner,undefined);
result=await request('/api/orders',{action:'create',id,order});assert.equal(result.body.order.version,1,'create retry is idempotent');
assert.equal((await request('/api/orders',{action:'create',id:crypto.randomUUID(),order})).status,409,'duplicate reference rejected');
assert.equal((await request('/api/orders',{action:'create',id:crypto.randomUUID(),order:{...order,reference:'',dueOn:'2026-02-30'}})).status,400);
result=await request('/api/orders',{action:'search',query:order.reference,due:'overdue',today:'2026-09-21'});assert.equal(result.body.total,1);
const [a,b]=await Promise.all([request('/api/orders',{action:'update',id,version:1,order:{...order,status:'Ready'}}),request('/api/orders',{action:'update',id,version:1,order:{...order,status:'At lab'}})]);
assert.deepEqual([a.status,b.status].sort(),[200,409]);
result=await request('/api/orders',{action:'history',id});assert.equal(result.body.history.length,2,'only one history event for concurrent updates');
const batchId=crypto.randomUUID();result=await request('/api/batches',{action:'create',id:batchId,name:'Synthetic test batch'});assert.equal(result.status,200);
result=await request('/api/batches',{action:'append',id:batchId,codes:[{code:'012345678905'},{code:'0012345678905'}]});assert.equal(result.body.added,1,'equivalent leading-zero code is grouped');
result=await request('/api/batches',{action:'get',id:batchId});assert.equal(result.body.codes.length,1);assert.equal(result.body.codes[0].code,'012345678905');
const codeId=result.body.codes[0].id;
assert.equal((await request('/api/batches',{action:'append',id:batchId,codes:[{code:'012345678906'}]})).status,400);
result=await request('/api/batches',{action:'done',id:batchId,codeId,done:true});assert.equal(result.body.codes[0].done,true);
await request('/api/batches',{action:'complete',id:batchId});
assert.equal((await request('/api/batches',{action:'append',id:batchId,codes:[{code:'036000291452'}]})).status,409);
await request('/api/batches',{action:'reopen',id:batchId});
assert.equal((await request('/api/batches',{action:'append',id:batchId,codes:[{code:'036000291452'}]})).body.added,1);
console.log('Local API checks passed: authentication, origin protection, idempotency, date validation, concurrent updates with atomic history, duplicate grouping, transfer progress, complete/reopen.');

