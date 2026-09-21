import {extractCodes} from '../components/scanner/upc.mjs';

// Extract only explicitly labelled administrative fields. The operator reviews every result.
export function fullDate(value){
  const raw=String(value||'').trim();
  let year,month,day,m;
  if((m=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/.exec(raw))){[,year,month,day]=m;}
  else if((m=/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/.exec(raw))){[,month,day,year]=m;}
  else return '';
  const date=new Date(Date.UTC(+year,+month-1,+day));
  if(date.getUTCFullYear()!==+year||date.getUTCMonth()!==+month-1||date.getUTCDate()!==+day)return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
export function extractOrder(text){
  const lines=String(text).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const field=(pattern)=>{
    for(const line of lines){const match=pattern.exec(line);if(match)return match[1].split(/\s{3,}|\s+(?:Phone|DOB|Order Date|Expected|Lab Make|UPC Code|Doctor|Optician)\s*:/i)[0].trim();}
    return '';
  };
  const patient=field(/\b(?:Patient(?:\s+name)?|Customer)\s*:\s*(.+)/i);
  const reference=field(/\b(?:Order|Job|Ticket)\s*(?:number|no\.?|#|id)\s*[:#]?\s*([\w-]+)/i);
  const lab=field(/\bLab\s*(?:make|name)?\s*:\s*(.+)/i);
  const ordered=field(/\b(?:Order(?:ed)?\s*date|Ordered\s*on)\s*:\s*(\S+)/i);
  const due=field(/\b(?:Expected(?:\s*date)?|Due(?:\s*date)?)\s*:\s*(\S+)/i);
  const codes=extractCodes(text).filter(c=>c.valid&&c.trusted&&!c.corrected);
  const warnings=[];
  if(!patient)warnings.push('Patient name was not read. Enter it from the paper.');
  if(!reference)warnings.push('No order number was found. Add it if one is printed.');
  if(ordered&&!fullDate(ordered))warnings.push(`Check the order date “${ordered}”; a complete year is required.`);
  if(due&&!fullDate(due))warnings.push(`Check the expected date “${due}”; a complete year is required.`);
  if(codes.length>1)warnings.push('Multiple UPCs were found. Choose the frame UPC from the paper.');
  return {order:{patient:patient.slice(0,160),reference:reference.slice(0,100),lab:lab.slice(0,160),upc:codes.length===1?codes[0].code:'',orderedOn:fullDate(ordered),dueOn:fullDate(due),status:'Received',notes:''},warnings};
}
