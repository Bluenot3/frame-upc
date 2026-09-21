import {identity,database,body,json,failure,AppError} from '../../../lib/server';
import {normalizeCode,isCodeLength,validCheckDigit,codeKey} from '../../../components/scanner/upc.mjs';
export async function POST(request:Request){try{
  const owner=await identity(request),data=await body(request),db=database(),now=new Date().toISOString();
  if(data.action==='list')return json({batches:(await db.prepare('SELECT b.*, (SELECT count(*) FROM batch_codes c WHERE c.batch_id=b.id AND c.owner=b.owner) AS count, (SELECT count(*) FROM batch_codes c WHERE c.batch_id=b.id AND c.owner=b.owner AND done=1) AS done FROM batches b WHERE owner=? ORDER BY updated_at DESC LIMIT 500').bind(owner).all()).results.map(({owner,...b}:any)=>b)});
  const id=String(data.id||'');if(!/^[\w-]{10,80}$/.test(id))throw new AppError('Invalid batch identifier.');
  if(data.action==='create'){
    const name=String(data.name||'').trim().slice(0,100);if(!name)throw new AppError('Name this batch.');
    await db.prepare('INSERT INTO batches (id,owner,name,status,created_at,updated_at) VALUES (?,?,?,\'open\',?,?) ON CONFLICT(id) DO NOTHING').bind(id,owner,name,now,now).run();
  }
  const batch:any=await db.prepare('SELECT id,name,status,created_at,updated_at FROM batches WHERE id=? AND owner=?').bind(id,owner).first();if(!batch)throw new AppError('Batch not found.',404);
  if(data.action==='append'){
    if(batch.status!=='open')throw new AppError('Reopen this batch before adding codes.',409);
    if(!Array.isArray(data.codes)||!data.codes.length||data.codes.length>250)throw new AppError('Add between 1 and 250 codes at a time.');
    const codes=data.codes.map((item:any)=>{const code=normalizeCode(item.code);if(!isCodeLength(code)||(!validCheckDigit(code)&&item.reviewed!==true))throw new AppError('Check each UPC before adding it.');return code;});
    const count=await db.prepare('SELECT count(*) AS count FROM batch_codes WHERE batch_id=? AND owner=?').bind(id,owner).first<{count:number}>();
    if((count?.count||0)+codes.length>20000)throw new AppError('Start a new batch after 20,000 codes. This batch remains available for transfer.');
    // Every insert checks batch ownership and open state again inside the same transaction.
    const statements=codes.map((code:string)=>db.prepare('INSERT INTO batch_codes (id,batch_id,owner,code,code_key,done,created_at) SELECT ?,id,owner,?,?,0,? FROM batches WHERE id=? AND owner=? AND status=\'open\' ON CONFLICT(batch_id,code_key) DO NOTHING').bind(crypto.randomUUID(),code,codeKey(code),now,id,owner));
    const results=await db.batch([...statements,db.prepare('UPDATE batches SET updated_at=? WHERE id=? AND owner=? AND status=\'open\'').bind(now,id,owner)]);
    return json({added:results.slice(0,-1).reduce((n,r)=>n+(r.meta.changes||0),0)});
  }
  if(data.action==='done')await db.batch([db.prepare('UPDATE batch_codes SET done=? WHERE batch_id=? AND owner=? AND id=?').bind(data.done?1:0,id,owner,String(data.codeId)),db.prepare('UPDATE batches SET updated_at=? WHERE id=? AND owner=?').bind(now,id,owner)]);
  if(data.action==='complete'||data.action==='reopen')await db.prepare('UPDATE batches SET status=?,updated_at=? WHERE id=? AND owner=?').bind(data.action==='complete'?'complete':'open',now,id,owner).run();
  if(!['create','get','done','complete','reopen'].includes(data.action))throw new AppError('Unknown action.');
  const codes=(await db.prepare('SELECT id,code,done,created_at FROM batch_codes WHERE batch_id=? AND owner=? ORDER BY created_at,id LIMIT 20001').bind(id,owner).all()).results;
  if(codes.length>20000)throw new AppError('This batch is too large. Use a separate batch for the next set of codes.');
  return json({batch:{...batch,status:data.action==='complete'?'complete':data.action==='reopen'?'open':batch.status},codes:codes.map((c:any)=>({...c,done:c.done===1}))});
}catch(error){return failure(error);}}
