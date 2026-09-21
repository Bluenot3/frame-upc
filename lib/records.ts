import {z} from 'zod';
import {fullDate} from './extract-order.mjs';
export const statuses=['Received','At lab','Quality check','Ready','Picked up','On hold'] as const;
const calendarDate=z.string().refine(s=>s===''||(/^\d{4}-\d{2}-\d{2}$/.test(s)&&fullDate(s)===s),'Enter a valid complete date.');
export const orderFields=z.object({patient:z.string().trim().min(1,'Enter a patient name.').max(160),reference:z.string().trim().max(100),upc:z.string().trim().regex(/^$|^\d{12,14}$/,'UPC must contain 12–14 digits.'),lab:z.string().trim().max(160),orderedOn:calendarDate,dueOn:calendarDate,status:z.enum(statuses),notes:z.string().max(3000)});
export type OrderInput=z.infer<typeof orderFields>;
export type Order=OrderInput&{id:string;version:number;createdAt:string;updatedAt:string};
export const blankOrder=():OrderInput=>({patient:'',reference:'',upc:'',lab:'',orderedOn:new Date().toLocaleDateString('en-CA'),dueOn:'',status:'Received',notes:''});
export function csvCell(value:unknown){const s=String(value??'');return '"'+(/^[=+@\-\t\r]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
export function orderCsv(rows:Order[]){return [['Patient','Order number','Frame UPC','Lab','Ordered','Due','Status','Notes'],...rows.map(o=>[o.patient,o.reference,o.upc,o.lab,o.orderedOn,o.dueOn,o.status,o.notes])].map(r=>r.map(csvCell).join(',')).join('\r\n');}
