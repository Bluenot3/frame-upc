// Keep identifiers as strings: a leading zero is part of a UPC.
export function normalizeCode(value) { return String(value).trim().replace(/[\s-]/g, ''); }
export function isCodeLength(code) { return /^\d{12,14}$/.test(code); }
export function validCheckDigit(code) {
  if (!isCodeLength(code)) return false;
  let sum = 0;
  for (let i=code.length-2, weight=3; i>=0; i--, weight=4-weight) sum += Number(code[i])*weight;
  return (10-sum%10)%10 === Number(code.at(-1));
}
export function codeKey(code) { return code.padStart(14,'0'); }

export function extractCodes(text, {guide=false}={}) {
  const results = new Map();
  const lines = String(text).split(/\r?\n/);
  function collect(segment, labeled) {
    // No digit guessing. OCR substitutions are shown for review, never auto-added.
    const pattern = /(?<![\w])([0-9OIlSBZ](?:[ \t-]?[0-9OIlSBZ]){11,13})(?![\w])/g;
    for (const match of segment.matchAll(pattern)) {
      const raw = match[1].replace(/[ \t-]/g,'');
      if (!/\d/.test(raw)) continue;
      const code = raw.replace(/[OIlSBZ]/g,c=>({O:'0',I:'1',l:'1',S:'5',B:'8',Z:'2'}[c]));
      const corrected = raw !== code;
      if (!isCodeLength(code)) continue;
      const candidate = {code, valid:validCheckDigit(code), labeled, corrected, trusted:(labeled||guide)&&!corrected};
      const prior = results.get(code);
      if (!prior || candidate.labeled || (!candidate.corrected&&prior.corrected)) results.set(code,candidate);
    }
  }
  for (let i=0;i<lines.length;i++) {
    const label = /\b(?:U\s*P\s*C|EAN|GTIN)\b(?:\s*(?:code|number|no\.?))?\s*[:#.-]?/i.exec(lines[i]);
    if (label) {
      const rest = lines[i].slice(label.index+label[0].length);
      collect(rest,true);
      if (!rest.trim() && lines[i+1]) collect(lines[i+1],true);
    }
  }
  // Full photos must identify the label to avoid treating unrelated numbers as frame codes.
  if (guide) for (const line of lines) collect(line,false);
  return [...results.values()];
}

export function addEntry(entries,code,{reviewed=false,source='manual'}={}) {
  if (!isCodeLength(code) || (!validCheckDigit(code)&&!reviewed)) throw new Error('Review the UPC before adding it.');
  if (entries.some(e=>codeKey(e.code)===codeKey(code))) return {entries,duplicate:true};
  return {entries:[...entries,{code,source,reviewed,done:false,addedAt:new Date().toISOString()}],duplicate:false};
}
export function toCsv(entries) { return 'UPC\r\n'+entries.map(e=>e.code).join('\r\n')+'\r\n'; }
export const STORAGE_KEY='framescan.list.v1';
export function parseSaved(value) {
  if (!value) return [];
  const data=JSON.parse(value);
  if (data.version!==1 || !Array.isArray(data.entries)) throw new Error('Saved list has an unsupported format.');
  const seen = new Set();
  return data.entries.filter(e=>isCodeLength(e?.code)&&!seen.has(codeKey(e.code))&&seen.add(codeKey(e.code)))
    .map(e=>({code:e.code,done:e.done===true,reviewed:e.reviewed===true,source:['camera','photo','manual'].includes(e.source)?e.source:'manual',addedAt:typeof e.addedAt==='string'?e.addedAt:''}));
}
