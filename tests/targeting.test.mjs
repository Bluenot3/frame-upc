import test from 'node:test';
import assert from 'node:assert/strict';
import {codeBounds,mapCodeBox,refineInkBox,frameDifference,createConfirmation,zoomArea} from '../components/scanner/targeting.mjs';
const code='788678086723';
const page=words=>({blocks:[{paragraphs:[{lines:[{words}]}]}]});
test('outline selects the UPC digits and excludes their label',()=>{
  const symbols=[...code].map((text,i)=>({text,bbox:{x0:100+i*10,y0:20,x1:109+i*10,y1:40}}));
  const data=page([{text:'UPC Code',bbox:{x0:1,y0:20,x1:90,y1:40}},{text:code,symbols}]);
  assert.deepEqual(codeBounds(data,code),{x0:100,y0:20,x1:219,y1:40});
});
test('split numeric words get one wireframe without swallowing unrelated text',()=>{
  const data=page([{text:'UPC',bbox:{x0:0,y0:0,x1:35,y1:20}},{text:'788678',bbox:{x0:40,y0:0,x1:90,y1:20}},{text:'086723',bbox:{x0:95,y0:0,x1:150,y1:20}}]);
  assert.deepEqual(codeBounds(data,code),{x0:40,y0:0,x1:150,y1:20});
  assert.equal(codeBounds(data,'012345678905'),null);
});
test('wireframe maps enlarged OCR pixels back to original camera coordinates',()=>{
  const rect=mapCodeBox({x0:40,y0:40,x1:440,y1:120},500,136,{x:1390,y:990,width:125,height:34},2560,1440);
  assert.ok(Math.abs(rect.left-(1390+7.6)/2560)<1e-10);
  assert.ok(Math.abs(rect.top-(990+7.6)/1440)<1e-10);
  assert.ok(rect.width<125/2560);assert.ok(rect.height<34/1440);
});
test('wireframe padding is clipped at the captured image edges',()=>{
  assert.deepEqual(mapCodeBox({x0:0,y0:0,x1:400,y1:80},400,80,{x:500,y:300,width:100,height:20},1000,600),{left:.5,top:.5,width:.1,height:20/600});
  assert.equal(mapCodeBox(null,400,80,{},1000,600),null);
});
test('two consecutive matching reads confirm once and allow the next paper',()=>{
  const c=createConfirmation(),a={code,valid:true,trusted:true},b={code:'012345678905',valid:true,trusted:true};
  assert.deepEqual(c.observe([a]),{phase:'confirming',deliver:false,reads:1,required:2});
  assert.deepEqual(c.observe([a]),{phase:'captured',deliver:true,reads:2,required:2});
  assert.equal(c.observe([a]).deliver,false);
  assert.equal(c.observe([b]).deliver,false);assert.equal(c.observe([b]).deliver,true);
});
test('major paper movement and multiple candidates break confirmation',()=>{
  const c=createConfirmation(),a={code,valid:true,trusted:true};
  c.observe([a]);c.reset();assert.equal(c.observe([a]).deliver,false);
  c.observe([a,a]);assert.equal(c.observe([a]).deliver,false);
});
test('untrusted or invalid codes get review state rather than a green capture',()=>{
  for(const a of [{code,valid:false,trusted:true},{code,valid:true,trusted:false}]){
    const c=createConfirmation();for(let i=0;i<3;i++)assert.equal(c.observe([a]).deliver,false);
    assert.deepEqual(c.observe([a]),{phase:'review',deliver:true,reads:4,required:4});
  }
});
test('brief missed reads retain good evidence, but stale or conflicting reads do not',()=>{
  const a={code,valid:true,trusted:true},b={code:'012345678905',valid:true,trusted:true};
  const c=createConfirmation();c.observe([a],1000);c.observe([],1500);c.observe([],2000);
  assert.equal(c.observe([a],2500).deliver,true);
  const expired=createConfirmation();expired.observe([a],1000);assert.equal(expired.observe([a],12000).deliver,false);
  const missed=createConfirmation();missed.observe([a],1000);for(let i=0;i<3;i++)missed.observe([],1500+i*500);assert.equal(missed.observe([a],3500).deliver,false);
  const conflict=createConfirmation();conflict.observe([a],1000);conflict.observe([b],1500);assert.equal(conflict.observe([a],2000).deliver,false);
});
test('corrected digits never become a green capture by repetition',()=>{
  const c=createConfirmation(),candidate={code,valid:true,trusted:true,corrected:true};let result;
  for(let i=0;i<4;i++)result=c.observe([candidate]);assert.equal(result.phase,'review');
});
test('auto zoom pads the digit line while staying within the selected guide',()=>{
  const outer={left:.2,top:.3,width:.4,height:.2};
  const result=zoomArea({left:.3,top:.35,width:.15,height:.025},outer);
  assert.ok(result.width<outer.width&&result.height<outer.height);
  assert.ok(result.left>=outer.left&&result.top>=outer.top&&result.left+result.width<=.600001);
  assert.deepEqual(zoomArea(null,outer),outer);
});
test('movement detection tolerates slight exposure changes but catches changing print',()=>{
  const a=Uint8Array.from([20,200,20,200]);
  assert.ok(frameDifference(a,Uint8Array.from([24,204,24,204]))<10);
  assert.ok(frameDifference(a,Uint8Array.from([200,20,200,20]))>10);
  assert.equal(frameDifference(a,null),Infinity);
});
test('ink refinement removes paper margins while preserving the digit row',()=>{
  const width=120,height=40,data=new Uint8ClampedArray(width*height*4).fill(240);
  for(let y=13;y<29;y++)for(let x=10;x<109;x++)if(x%9<5){const p=(y*width+x)*4;data[p]=data[p+1]=data[p+2]=55;}
  const box=refineInkBox({width,height,data},{x0:0,y0:0,x1:120,y1:40});
  assert.deepEqual(box,{x0:10,y0:13,x1:109,y1:29});
  assert.deepEqual(refineInkBox({width,height,data:new Uint8ClampedArray(data.length).fill(240)},{x0:0,y0:0,x1:120,y1:40}),{x0:0,y0:0,x1:120,y1:40});
});

