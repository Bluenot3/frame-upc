export const DEFAULT_AREA={left:.35,top:.455,width:.30,height:.09};
export const isVirtualCamera=label=>/poly camera|virtual|camo|reincubate|obs|snap camera|manycam/i.test(label||'');
export function chooseDocumentCamera(devices,requested=''){
  const cameras=devices.filter(d=>d.kind==='videoinput');
  if(requested&&cameras.some(d=>d.deviceId===requested))return cameras.find(d=>d.deviceId===requested);
  const score=d=>(isVirtualCamera(d.label)?-100:0)+(/\bIR\b|infrared|depth/i.test(d.label)?-100:0)+(d.label?10:0)+(/rear|back|environment/i.test(d.label)?30:0)+(/HP 5MP|integrated|USB|webcam/i.test(d.label)?20:0);
  return [...cameras].sort((a,b)=>score(b)-score(a))[0]||null;
}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function clampArea(area){
  const width=clamp(Number(area.width)||DEFAULT_AREA.width,.035,.85);
  const height=clamp(Number(area.height)||DEFAULT_AREA.height,.015,.40);
  return {left:clamp(Number(area.left)||0,0,1-width),top:clamp(Number(area.top)||0,0,1-height),width,height};
}
export function centerArea(area,x,y){return clampArea({...area,left:x-area.width/2,top:y-area.height/2});}
export function resizeArea(area,width){return centerArea({...area,width,height:clamp(area.height*width/area.width,.015,.40)},area.left+area.width/2,area.top+area.height/2);}
export function areaFromDrag(a,b){return clampArea({left:Math.min(a.x,b.x),top:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)});}
export function sourceRect(width,height,area){const r=clampArea(area);return {x:Math.round(r.left*width),y:Math.round(r.top*height),width:Math.max(1,Math.floor(r.width*width)),height:Math.max(1,Math.floor(r.height*height))};}
export function cameraInfo(track){
  const settings=track.getSettings?.()||{},caps=track.getCapabilities?.()||{};
  const modes=Array.isArray(caps.focusMode)?caps.focusMode:[];
  return {width:settings.width||0,height:settings.height||0,focusMode:settings.focusMode||'',autoAvailable:modes.includes('continuous')||modes.includes('single-shot'),manualRange:modes.includes('manual')&&caps.focusDistance?.max>caps.focusDistance?.min?caps.focusDistance:null,focusDistance:settings.focusDistance,name:track.label||'Camera',virtual:isVirtualCamera(track.label),backgroundBlur:typeof settings.backgroundBlur==='boolean'?settings.backgroundBlur:null,faceFraming:typeof settings.faceFraming==='boolean'?settings.faceFraming:null};
}
export async function disableCameraEffects(track,supported={}){
  const caps=track.getCapabilities?.()||{};
  for(const key of ['backgroundBlur','faceFraming','eyeGazeCorrection']){
    if(!caps[key]?.includes(false)&&!supported[key])continue;
    try{await track.applyConstraints({...track.getConstraints?.(),[key]:{exact:false}});}catch{/* OS or driver may own this effect; do not disrupt capture. */}
  }
  return cameraInfo(track);
}
function focusConstraints(track,changes){
  const current=track.getConstraints?.()||{};
  const advanced=Object.assign({},...(current.advanced||[]),changes);
  if(changes.focusMode&&changes.focusMode!=='manual')delete advanced.focusDistance;
  return {...current,advanced:[advanced]};
}
export async function focusCamera(track,point,supported={}){
  const caps=track.getCapabilities?.()||{},modes=caps.focusMode||[];
  const mode=modes.includes('continuous')?'continuous':modes.includes('single-shot')?'single-shot':null;
  if(mode){
    // Advanced camera constraints are optional. A driver refusing focus must not stop capture.
    try{await track.applyConstraints(focusConstraints(track,{focusMode:mode}));}catch{/* keep the working stream */}
    if(supported.pointsOfInterest){try{await track.applyConstraints(focusConstraints(track,{pointsOfInterest:[{x:clamp(point.x,0,1),y:clamp(point.y,0,1)}]}));}catch{/* device may not support a focus target */}}
  }
  return cameraInfo(track);
}
export async function configureCamera(track,point,supported={}){
  try{track.contentHint='detail';}catch{/* contentHint is a quality hint, not a requirement */}
  const caps=track.getCapabilities?.()||{};
  if(caps.width?.max&&caps.height?.max){
    try{await track.applyConstraints({...track.getConstraints?.(),width:{ideal:Math.min(caps.width.max,3840)},height:{ideal:Math.min(caps.height.max,2160)},...(caps.resizeMode?.includes('none')?{resizeMode:{ideal:'none'}}:{})});}catch{/* negotiated resolution remains usable */}
  }
  await disableCameraEffects(track,supported);
  return focusCamera(track,point,supported);
}
export async function manualCameraFocus(track,value){
  const range=cameraInfo(track).manualRange;
  if(!range)return cameraInfo(track);
  await track.applyConstraints(focusConstraints(track,{focusMode:'manual',focusDistance:clamp(Number(value),range.min,range.max)}));
  return cameraInfo(track);
}
