import {orderFields} from '../../../lib/records';
import {identity,database,body,json,failure,orderRow,AppError} from '../../../lib/server';
export async function POST(request:Request){try{
  const owner=await identity(request),data=await body(request),db=database();
  if(data.action==='search'){
    const query=String(data.query||'').slice(0,160),status=String(data.status||'all'),offset=Math.max(0,Math.min(1000000,Number(data.offset)||0));
    const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
    const due=['overdue','today'].includes(data.due)?data.due:'all',today=/^\d{4}-\d{2}-\d{2}$/.test(data.today)?data.today:new Date().toISOString().slice(0,10);
    const where="owner=? AND (?='all' OR status=?) AND (patient LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\' OR upc LIKE ? ESCAPE '\\') AND (?='all' OR (status NOT IN ('Ready','Picked up') AND due_on<>'' AND ((?='overdue' AND due_on<?) OR (?='today' AND due_on=?))))";
    const values=[owner,status,status,pattern,pattern,pattern,due,due,today,due,today];
    const [rows,total,counts]=await db.batch([db.prepare(`SELECT * FROM orders WHERE ${where} ORDER BY updated_at DESC,id DESC LIMIT 100 OFFSET ?`).bind(...values,offset),db.prepare(`SELECT count(*) AS total FROM orders WHERE ${where}`).bind(...values),db.prepare('SELECT status,count(*) AS count FROM orders WHERE owner=? GROUP BY status').bind(owner)]);
    return json({orders:rows.results.map(orderRow),total:Number((total.results[0] as any)?.total||0),counts:counts.results});
  }
  if(data.action==='history')return json({history:(await db.prepare('SELECT status,message,created_at AS createdAt FROM order_history WHERE owner=? AND order_id=? ORDER BY created_at DESC LIMIT 100').bind(owner,String(data.id)).all()).results});
  if(data.action==='export'){
    const rows=await db.prepare('SELECT * FROM orders WHERE owner=? ORDER BY created_at DESC LIMIT 10001').bind(owner).all();
    if(rows.results.length>10000)throw new AppError('Export is limited to 10,000 orders at a time.');return json({orders:rows.results.map(orderRow)});
  }
  const parsed=orderFields.safeParse(data.order);if(!parsed.success)throw new AppError(parsed.error.issues[0].message);
  const o=parsed.data,now=new Date().toISOString(),id=String(data.id||crypto.randomUUID());if(!/^[\w-]{10,80}$/.test(id))throw new AppError('Invalid order identifier.');
  if(data.action==='create'){
    const existing=await db.prepare('SELECT * FROM orders WHERE id=? AND owner=?').bind(id,owner).first();if(existing)return json({order:orderRow(existing)});
    await db.batch([db.prepare('INSERT INTO orders (id,owner,patient,reference,upc,lab,ordered_on,due_on,status,notes,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)').bind(id,owner,o.patient,o.reference,o.upc,o.lab,o.orderedOn,o.dueOn,o.status,o.notes,now,now),db.prepare('INSERT INTO order_history (id,owner,order_id,status,message,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,id,o.status,'Order created',now)]);
  }else if(data.action==='update'){
    const old:any=await db.prepare('SELECT * FROM orders WHERE id=? AND owner=?').bind(id,owner).first();if(!old)throw new AppError('Order not found.',404);
    if(old.version!==data.version)throw new AppError('This order changed on another device. Close and reopen it before saving.',409);
    const [changed]=await db.batch([db.prepare('UPDATE orders SET patient=?,reference=?,upc=?,lab=?,ordered_on=?,due_on=?,status=?,notes=?,version=version+1,updated_at=? WHERE id=? AND owner=? AND version=?').bind(o.patient,o.reference,o.upc,o.lab,o.orderedOn,o.dueOn,o.status,o.notes,now,id,owner,data.version),db.prepare('INSERT INTO order_history (id,owner,order_id,status,message,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),owner,id,o.status,old.status===o.status?'Order details updated':`${old.status} → ${o.status}`,now)]);
    if(!changed.meta.changes)throw new AppError('This order changed on another device. Reopen it before saving.',409);
  }else throw new AppError('Unknown action.');
  return json({order:orderRow(await db.prepare('SELECT * FROM orders WHERE id=? AND owner=?').bind(id,owner).first())});
}catch(error){return failure(error);}}
