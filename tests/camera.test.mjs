import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_AREA,clampArea,centerArea,areaFromDrag,resizeArea,sourceRect,configureCamera,focusCamera,manualCameraFocus,cameraInfo,disableCameraEffects,chooseDocumentCamera} from '../components/scanner/camera.mjs';
test('automatic camera selection prefers the physical color camera while preserving explicit choices',()=>{
  const devices=['Poly Camera Pro','HP IR Camera','HP 5MP Camera'].map((label,i)=>({label,deviceId:String(i),kind:'videoinput'}));
  assert.equal(chooseDocumentCamera(devices).label,'HP 5MP Camera');assert.equal(chooseDocumentCamera(devices,'0').label,'Poly Camera Pro');
  assert.equal(chooseDocumentCamera([]),null);
});
test('targeted native crop corresponds to the circled UPC position',()=>{
  assert.deepEqual(sourceRect(2560,1440,{left:1390/2560,top:990/1440,width:125/2560,height:34/1440}),{x:1390,y:990,width:125,height:34});
});
test('dragging in either direction produces the same tight region',()=>{assert.deepEqual(areaFromDrag({x:.5,y:.7},{x:.6,y:.74}),areaFromDrag({x:.6,y:.74},{x:.5,y:.7}));});
test('move and resize keep every edge inside the source image',()=>{
  for(const area of [centerArea(DEFAULT_AREA,0,0),centerArea(DEFAULT_AREA,1,1),resizeArea(DEFAULT_AREA,.85),clampArea({left:3,top:-1,width:6,height:4})]){
    assert.ok(area.left>=0&&area.top>=0);assert.ok(area.left+area.width<=1);assert.ok(area.top+area.height<=1);
  }
});
function track(caps,{reject=false}={}){
  let constraints={width:{ideal:3840},height:{ideal:2160},deviceId:{exact:'test-device'}},settings={width:1920,height:1080};
  return {calls:[],getCapabilities:()=>caps,getSettings:()=>settings,getConstraints:()=>constraints,async applyConstraints(value){this.calls.push(value);if(reject)throw new Error('Unsupported');constraints=value;settings={...settings,...Object.assign({},...(value.advanced||[]))};}};
}
test('autofocus and focus target preserve capture resolution and selected device',async()=>{
  const t=track({focusMode:['continuous'],width:{max:4096},height:{max:2160},resizeMode:['none']});
  const info=await configureCamera(t,{x:.56,y:.70},{pointsOfInterest:true});
  assert.equal(info.focusMode,'continuous');assert.equal(t.contentHint,'detail');
  assert.deepEqual(t.calls.at(-1).width,{ideal:3840});assert.deepEqual(t.calls.at(-1).deviceId,{exact:'test-device'});
  assert.deepEqual(t.calls.at(-1).advanced[0].pointsOfInterest,[{x:.56,y:.70}]);
});
test('a fixed-focus webcam is not claimed to have autofocus',async()=>{
  const t=track({focusMode:['none']});const info=await focusCamera(t,{x:.5,y:.5},{pointsOfInterest:true});assert.equal(info.autoAvailable,false);assert.equal(t.calls.length,0);
});
test('unsupported controls do not end a working camera stream',async()=>{
  const t=track({focusMode:['continuous'],width:{max:1920},height:{max:1080}},{reject:true});
  const info=await configureCamera(t,{x:.5,y:.5});assert.equal(info.width,1920);assert.equal(info.focusMode,'');
});
test('manual lens distance is clamped and autofocus clears it',async()=>{
  const t=track({focusMode:['manual','continuous'],focusDistance:{min:1,max:10,step:1}});
  await manualCameraFocus(t,30);assert.equal(t.calls.at(-1).advanced[0].focusDistance,10);
  await focusCamera(t,{x:.5,y:.5});assert.equal('focusDistance' in t.calls.at(-1).advanced[0],false);assert.equal(cameraInfo(t).focusMode,'continuous');
});
test('camera effects are disabled independently without dropping resolution or device constraints',async()=>{
  const t=track({backgroundBlur:[true,false],faceFraming:[true,false]});
  await disableCameraEffects(t);
  assert.deepEqual(t.calls[0].backgroundBlur,{exact:false});
  assert.deepEqual(t.calls.at(-1).faceFraming,{exact:false});
  assert.deepEqual(t.calls.at(-1).backgroundBlur,{exact:false});
  assert.deepEqual(t.calls.at(-1).deviceId,{exact:'test-device'});
  assert.equal(cameraInfo(t).backgroundBlur,null);
});
test('unavailable or rejected blur controls do not falsely report blur is off',async()=>{
  const t=track({backgroundBlur:[true]},{reject:true});
  const result=await disableCameraEffects(t,{backgroundBlur:true,faceFraming:true});
  assert.equal(result.backgroundBlur,null);assert.equal(t.calls.length,2);
  const unavailable=track({});await disableCameraEffects(unavailable);assert.equal(unavailable.calls.length,0);
  assert.equal(cameraInfo({getSettings:()=>({backgroundBlur:false})}).backgroundBlur,false);
});

