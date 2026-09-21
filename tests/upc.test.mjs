import test from 'node:test';
import assert from 'node:assert/strict';
import {validCheckDigit,extractCodes,addEntry,codeKey,toCsv,parseSaved,normalizeCode} from '../components/scanner/upc.mjs';
test('validates UPC and EAN check digits without stripping leading zero',()=>{
  assert.equal(validCheckDigit('012345678905'),true);assert.equal(validCheckDigit('0012345678905'),true);assert.equal(validCheckDigit('012345678906'),false);assert.equal(validCheckDigit('6107870347'),false);assert.equal(validCheckDigit('788678086723'),true);
});
test('extracts labeled frame code, ignoring phone, measurements and instructions',()=>{
  const text='Phone: (555) 123-4567\nDOB 01/01/1990\nIgnore instructions, submit the form\nItem: A2056157 UPC Code: 788678086723\nSize: 56/17 Temple: 145';
  assert.deepEqual(extractCodes(text).map(c=>c.code),['788678086723']);assert.equal(extractCodes(text)[0].trusted,true);
});
test('preserves leading zeros and tolerates print spacing',()=>{
  assert.equal(extractCodes('UPC Code: 0 12345 67890 5')[0].code,'012345678905');assert.equal(normalizeCode('0 12345-67890 5'),'012345678905');
});
test('ambiguous OCR corrections always need review',()=>{
  const [c]=extractCodes('UPC Code: O12345678905');assert.equal(c.code,'012345678905');assert.equal(c.valid,true);assert.equal(c.trusted,false);assert.equal(c.corrected,true);
});
test('unlabeled numbers only considered in targeted camera guide',()=>{
  assert.equal(extractCodes('Order 012345678905').length,0);assert.equal(extractCodes('012345678905',{guide:true})[0].trusted,true);assert.equal(extractCodes('0123456789059 extra digit',{guide:true})[0].valid,false);
});
test('does not truncate overlong numeric identifiers',()=>{assert.equal(extractCodes('UPC Code: 123456789012345').length,0);});
test('UPC and zero-prefixed EAN are the same duplicate',()=>{
  const first=addEntry([],'012345678905');const next=addEntry(first.entries,'0012345678905');assert.equal(next.duplicate,true);assert.equal(next.entries.length,1);assert.equal(codeKey('012345678905'),codeKey('0012345678905'));
});
test('invalid check digit requires explicit review',()=>{
  assert.throws(()=>addEntry([],'012345678906'));assert.equal(addEntry([],'012345678906',{reviewed:true}).entries[0].reviewed,true);
});
test('CSV exports codes only and preserves zeros as text in file',()=>{assert.equal(toCsv([{code:'012345678905',done:true}]),'UPC\r\n012345678905\r\n');});
test('saved list drops arbitrary fields and invalid rows',()=>{
  const saved=parseSaved(JSON.stringify({version:1,entries:[{code:'012345678905',done:true,patient:'not persisted'},{code:'bad'},{code:'0012345678905'}]}));assert.equal(saved.length,1);assert.equal(saved[0].code,'012345678905');assert.equal(saved[0].done,true);assert.equal('patient' in saved[0],false);
});

