import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizeUpc} from '../components/scanner/recognition.mjs';
function worker(outputs){return {calls:[],async setParameters(params){this.calls.push(params);},async recognize(){return {data:{text:outputs.shift()||''}};}};}
test('stopping a camera read cancels remaining OCR retries',async()=>{
  const w=worker(['','788678086723']);
  await assert.rejects(recognizeUpc(w,{},true,{shouldCancel:()=>w.calls.length>0}),/cancelled/);
  assert.equal(w.calls.length,1);
});
test('tight UPC uses raw-line recognition first and preserves the code',async()=>{
  const w=worker(['788678086723']);const result=await recognizeUpc(w,{},true);assert.equal(result[0].code,'788678086723');assert.equal(result[0].valid,true);assert.equal(w.calls.length,1);assert.equal(w.calls[0].tessedit_pageseg_mode,'13');
});
test('fall back after incomplete digits without manufacturing a missing check digit',async()=>{
  const w=worker(['78867808672','75','788678086723']);const result=await recognizeUpc(w,{},true);assert.equal(result[0].code,'788678086723');assert.equal(w.calls.length,3);
});
test('invalid full-length reads remain review candidates',async()=>{
  const w=worker(['012345678906','012345678906','']);const result=await recognizeUpc(w,{},true);assert.equal(result.length,1);assert.equal(result[0].valid,false);
});
test('different failed passes are alternative readings, while two codes in one pass remain ambiguous',async()=>{
  const alternatives=await recognizeUpc(worker(['012345678906','012345678907','012345678906']),{},true);
  assert.equal(alternatives.length,1);assert.equal(alternatives[0].code,'012345678906');assert.equal(alternatives[0].valid,false);
  const separate=await recognizeUpc(worker(['012345678906\n012345678907','','']),{},true);assert.equal(separate.length,2);
});
test('compact retry maps detected digits back to the enlarged image coordinates',async()=>{
  const code='788678086723',calls=[];
  const smaller={getContext:()=>({drawImage(){}})};
  const image={width:1400,height:280,ownerDocument:{createElement:()=>smaller}};
  const w={async setParameters(){},async recognize(input){calls.push(input);return {data:calls.length===1?{text:''}:{text:code,blocks:[{paragraphs:[{lines:[{words:[{text:code,bbox:{x0:60,y0:20,x1:480,y1:80}}]}]}]}]}};}};
  const result=await recognizeUpc(w,image,true);
  assert.equal(calls.length,2);assert.equal(smaller.width,600);assert.equal(smaller.height,120);
  assert.equal(result[0].code,code);assert.equal(result[0].box.x0,140);assert.equal(result[0].box.x1,1120);
  assert.ok(Math.abs(result[0].box.y0-46.66666666666667)<1e-8);
});

