import React,{useEffect,useRef,useState} from 'react';
import {Camera,Video,ImagePlus,LockKeyhole,Square,LoaderCircle,Keyboard,ChevronDown,Plus,Pause,Play,Check} from 'lucide-react';
import PhotoCrop from './PhotoCrop.jsx';
import FocusTools from './FocusTools.jsx';
import {createScanner,captureBestGuide,prepareImage,createFrameSampler} from './ocr.js';
import {DEFAULT_AREA,clampArea,centerArea,resizeArea,areaFromDrag,configureCamera,focusCamera,manualCameraFocus,sourceRect,cameraInfo,disableCameraEffects,chooseDocumentCamera} from './camera.mjs';
import {mapCodeBox,frameDifference,createConfirmation,zoomArea} from './targeting.mjs';
import {normalizeCode,isCodeLength,validCheckDigit} from './upc.mjs';

export default function Scanner({onCandidates,onManual,paused,onComplete}) {
  const video=useRef(null),file=useRef(null),stream=useRef(null),engine=useRef(null),generation=useRef(0),callback=useRef(onCandidates),inFlight=useRef(false);
  const native=useRef(null),nativeAbort=useRef(null);
  const [documentAvailable,setDocumentAvailable]=useState(false),[cameraMode,setCameraMode]=useState('browser');
  const [active,setActive]=useState(false),[starting,setStarting]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[devices,setDevices]=useState([]),[device,setDevice]=useState(''),[ratio,setRatio]=useState(16/9),[manual,setManual]=useState(''),[manualError,setManualError]=useState('');
  callback.current=onCandidates;
  const [userPaused,setUserPaused]=useState(false),[photo,setPhoto]=useState(null);
  const [area,setArea]=useState(()=>{try{return clampArea(JSON.parse(localStorage.getItem('framescan.area.v1'))||DEFAULT_AREA);}catch{return DEFAULT_AREA;}}),[info,setInfo]=useState(null),[selecting,setSelecting]=useState(false);
  const dragStart=useRef(null),focusRequest=useRef(0);
  const [target,setTarget]=useState(null),[locked,setLocked]=useState(false),[autoZoom,setAutoZoom]=useState(true);

  useEffect(()=>{try{localStorage.setItem('framescan.area.v1',JSON.stringify(area));}catch{/* scan area still works without persistence */}},[area]);
  async function refocus(nextArea=area){const track=stream.current?.getVideoTracks()[0];if(!track||native.current)return;const request=++focusRequest.current;const result=await focusCamera(track,{x:nextArea.left+nextArea.width/2,y:nextArea.top+nextArea.height/2},navigator.mediaDevices.getSupportedConstraints?.()||{});if(request===focusRequest.current&&stream.current?.getVideoTracks()[0]===track)setInfo(result);}
  async function manualFocus(value){const track=stream.current?.getVideoTracks()[0];if(!track)return;try{const result=await manualCameraFocus(track,value);if(stream.current?.getVideoTracks()[0]===track)setInfo(result);}catch{setError('The camera did not accept manual focus. Try autofocus or adjust the paper distance.');}}
  function point(event){const rect=event.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
  function beginArea(event){if(!active||locked)return;setTarget(null);dragStart.current=point(event);event.currentTarget.setPointerCapture(event.pointerId);setSelecting(true);}
  function moveArea(event){if(!dragStart.current)return;const end=point(event);if(Math.abs(end.x-dragStart.current.x)>.015||Math.abs(end.y-dragStart.current.y)>.015)setArea(areaFromDrag(dragStart.current,end));}
  function finishArea(event){if(!dragStart.current)return;const end=point(event),start=dragStart.current;const moved=Math.abs(end.x-start.x)>.015||Math.abs(end.y-start.y)>.015;const next=moved?areaFromDrag(start,end):centerArea(area,end.x,end.y);setArea(next);dragStart.current=null;setSelecting(false);refocus(next);}
  function moveAreaKey(event){const step=event.shiftKey?.04:.01;const shifts={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};if(!active||locked||!shifts[event.key])return;event.preventDefault();setTarget(null);const [x,y]=shifts[event.key];setArea(r=>clampArea({...r,left:r.left+x,top:r.top+y}));}
  useEffect(()=>{
    engine.current=createScanner(m=>{if(m.status!=='recognizing text')setStatus('Preparing local scanner…');});
    return()=>{generation.current++;nativeAbort.current?.abort();native.current?.stop();stream.current?.getTracks().forEach(t=>t.stop());engine.current?.dispose();};
  },[]);
  function stop(){generation.current++;nativeAbort.current?.abort();native.current?.stop();native.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setActive(false);setStarting(false);setTarget(null);setStatus('');if(video.current)video.current.srcObject=null;}
  async function removeEffects(){const track=stream.current?.getVideoTracks()[0];if(!track)return;const result=await disableCameraEffects(track,navigator.mediaDevices.getSupportedConstraints?.()||{});if(stream.current?.getVideoTracks()[0]===track)setInfo(result);}
  async function start(){
    const id=++generation.current;setError('');setStarting(true);setUserPaused(false);
    try{
      let next,camera;
      {
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access requires localhost or HTTPS. Try Chrome or Edge on this computer.');
      const constraints={width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:24},resizeMode:{ideal:'none'}};
      next=await navigator.mediaDevices.getUserMedia({audio:false,video:{...constraints,...(device?{deviceId:{exact:device}}:{facingMode:{ideal:'environment'}})}});
      if(id!==generation.current){next.getTracks().forEach(t=>t.stop());return;}
      stream.current=next;
      try{
        const all=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
        if(id!==generation.current){next.getTracks().forEach(t=>t.stop());return;}
        setDevices(all);
        const preferred=chooseDocumentCamera(all,device),currentId=next.getVideoTracks()[0].getSettings().deviceId;
        if(preferred?.deviceId&&preferred.deviceId!==currentId){
          next.getTracks().forEach(t=>t.stop());
          next=await navigator.mediaDevices.getUserMedia({audio:false,video:{...constraints,deviceId:{exact:preferred.deviceId}}});
          if(id!==generation.current){next.getTracks().forEach(t=>t.stop());return;}
          stream.current=next;
        }
      }catch(e){if(next.getVideoTracks()[0]?.readyState==='ended')throw e;}
      camera=await configureCamera(next.getVideoTracks()[0],{x:area.left+area.width/2,y:area.top+area.height/2},navigator.mediaDevices.getSupportedConstraints?.()||{});
      }
      if(id!==generation.current){next.getTracks().forEach(t=>t.stop());return;}
      setInfo(camera);video.current.srcObject=next;await video.current.play();
      if(id!==generation.current){next.getTracks().forEach(t=>t.stop());return;}
      setRatio(video.current.videoWidth/video.current.videoHeight||16/9);setActive(true);setStatus('Select just the UPC numbers. Check the close-up below.');
      next.getVideoTracks()[0].addEventListener('ended',()=>{if(id===generation.current){stop();setError('Camera disconnected. Reconnect it and start again.');}});
      if(!camera.native){
        next.getVideoTracks()[0].addEventListener('configurationchange',()=>{if(id===generation.current)setInfo(cameraInfo(next.getVideoTracks()[0]));});
        try{const all=await navigator.mediaDevices.enumerateDevices();setDevices(all.filter(d=>d.kind==='videoinput'));setDevice(next.getVideoTracks()[0].getSettings().deviceId||'');}catch{/* camera still works if device enumeration is unavailable */}
      }
    }catch(e){
      if(id!==generation.current)return;
      nativeAbort.current?.abort();native.current?.stop();native.current=null;
      stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
      setError(e.name==='NotAllowedError'?'Camera access was blocked. Allow camera access in your browser, then try again. You can also scan a photo.':e.name==='NotFoundError'?'No camera found. Connect a webcam or use Scan photo.':e.name==='NotReadableError'?'The camera is busy. Close other apps using it, then try again.':e.message);
    }finally{if(id===generation.current)setStarting(false);}
  }
  useEffect(()=>{
    setTarget(null);
    if(!active||paused||userPaused||selecting)return;
    let cancelled=false,timer,outlineStamp=null,readArea=area,held=null;
    const confirmation=createConfirmation(),sample=createFrameSampler();
    // A changed paper clears the old outline immediately, even while OCR is busy.
    const monitor=setInterval(()=>{
      if(document.hidden){outlineStamp=null;held=null;confirmation.reset();setTarget(null);return;}
      const movement=outlineStamp?frameDifference(outlineStamp,sample(video.current,area)):0;
      if(movement>10){outlineStamp=null;held=null;readArea=area;if(movement>32)confirmation.reset();setTarget(null);}
    },120);
    async function tick(){
      if(cancelled)return;
      if(document.hidden){setStatus('Scanning paused while this tab is in the background.');timer=setTimeout(tick,1000);return;}
      if(held&&Date.now()-held.checkedAt<1200){timer=setTimeout(tick,150);return;}
      if(inFlight.current){timer=setTimeout(tick,120);return;}
      let nextDelay=250;
      inFlight.current=true;setBusy(!held);
      try{
        const currentArea=held?area:readArea,canvas=await captureBestGuide(video.current,currentArea);
        if(cancelled||!canvas)return;
        const stamp=sample(video.current,area),crop=sourceRect(video.current.videoWidth,video.current.videoHeight,currentArea);
        if(!held)setStatus(currentArea===area?'Reading the UPC · trying multiple zoom levels…':'Zoomed onto the digits · confirming…');
        const candidates=await engine.current.recognize(canvas,true,()=>cancelled);
        if(cancelled)return;
        setError('');
        const movement=frameDifference(stamp,sample(video.current,area));
        if(movement>18){if(movement>32)confirmation.reset();outlineStamp=null;held=null;readArea=area;setTarget(null);setStatus('Adjusting to the paper. Keep the digits in the guide.');return;}
        // A soft retry must not undo an already confirmed capture. Keep its
        // outline until movement or a different valid UPC identifies a new paper.
        if(held){
          const next=candidates.length===1?candidates[0]:null;
          if(!next||!next.valid||!next.trusted||next.corrected||next.code===held.target.code){
            held.checkedAt=Date.now();outlineStamp=stamp;setTarget(held.target);setStatus('Captured. Show the next paper.');return;
          }
          held=null;confirmation.reset();
        }
        const result=confirmation.observe(candidates);
        if(candidates.length!==1){outlineStamp=null;readArea=area;setTarget(null);setStatus(candidates.length?'More than one number found. Keep only one UPC in the guide.':result.reads?'Keeping the last read · trying again…':'Looking for digits · bring the UPC line into the guide.');return;}
        const candidate=candidates[0],rect=mapCodeBox(candidate.box,canvas.width,canvas.height,crop,video.current.videoWidth,video.current.videoHeight);
        outlineStamp=stamp;
        readArea=autoZoom&&rect?zoomArea(rect,area):area;
        if(result.reads===1&&rect&&info?.autoAvailable)refocus(rect);
        const nextTarget=rect?{rect,code:candidate.code,phase:result.phase,reads:result.reads,required:result.required}:null;
        setTarget(nextTarget);
        if(nextTarget&&result.phase==='captured')held={target:nextTarget,checkedAt:Date.now()};
        if(result.deliver)callback.current(candidates,'camera');
        setStatus(result.phase==='captured'?'Captured. Show the next paper.':result.phase==='review'?'Repeated read needs a digit check. Saved for review; keep scanning.':result.required===2?'UPC found — confirming a second read…':'Checking uncertain digits at more zoom levels…');
        nextDelay=result.phase==='confirming'?120:350;
      }catch(e){if(!cancelled){setError('Recognition was interrupted. The camera is still on; retrying automatically. You can pause or complete the batch.');}}
      finally{inFlight.current=false;setBusy(false);if(!cancelled)timer=setTimeout(tick,nextDelay);}
    }
    timer=setTimeout(tick,250);
    return()=>{cancelled=true;clearTimeout(timer);clearInterval(monitor);};
  },[active,paused,userPaused,selecting,autoZoom,area.left,area.top,area.width,area.height]);
  async function scanPhoto(event){
    const selected=event.target.files?.[0];event.target.value='';if(!selected)return;
    if(selected.size>30*1024*1024){setError('Choose an image smaller than 30 MB.');return;}
    setError('');
    let bitmap;
    try{
      bitmap=await createImageBitmap(selected);
      if(bitmap.width*bitmap.height>40000000)throw new Error('This photo is too large. Choose one under 40 megapixels.');
      setPhoto({bitmap,url:URL.createObjectURL(selected)});bitmap=null;
    }catch(e){setError(String(e?.message||e).includes('megapixels')?String(e.message):'Could not read this image. Try a JPG or PNG with the UPC label and numbers in focus.');}
    finally{bitmap?.close();inFlight.current=false;setBusy(false);setStatus('');}
  }
  function closePhoto(){photo?.bitmap.close();if(photo)URL.revokeObjectURL(photo.url);setPhoto(null);}
  async function readPhoto(rect){
    const currentPhoto=photo;
    const canvas=prepareImage(currentPhoto.bitmap,rect.x*currentPhoto.bitmap.width,rect.y*currentPhoto.bitmap.height,rect.w*currentPhoto.bitmap.width,rect.h*currentPhoto.bitmap.height,1400);
    closePhoto();setBusy(true);inFlight.current=true;setStatus('Reading the selected UPC…');setError('');
    try{const candidates=await engine.current.recognize(canvas,true);if(!candidates.length)setError('No complete UPC found. Try a closer, sharper photo with only the UPC line selected.');else callback.current(candidates,'photo');}
    catch{setError('The local scanner could not read this photo. Try again or enter the UPC manually.');}
    finally{setBusy(false);inFlight.current=false;setStatus('');}
  }
  function addManual(e){e.preventDefault();const code=normalizeCode(manual);if(!isCodeLength(code)){setManualError('Enter 12, 13, or 14 digits, including any leading zeros.');return;}onManual({code,valid:validCheckDigit(code),trusted:true,corrected:false},'manual');setManual('');setManualError('');}
  return <section className="panel scanner-panel" aria-labelledby="scanner-heading">
    <div className="panel-heading"><h2 id="scanner-heading">Scanner</h2><span className="camera-status"><i className={active?'live':''}/>{active?'Camera on':'Camera off'}</span></div>
    {documentAvailable&&<label className="camera-mode">Capture mode<select value={cameraMode} disabled={active||starting} onChange={e=>setCameraMode(e.target.value)}><option value="document">Document camera · no portrait effects</option><option value="browser">Browser camera</option></select></label>}
    {active&&<p className={'camera-source '+(info?.virtual?'virtual-source':'')}>Camera: <strong>{info?.name||'Checking source…'}</strong>{info?.native&&<span className="no-effects">Windows No Effects · full sensor view</span>}{info?.virtual&&<span>Virtual camera effects may blur paper. Choose the physical webcam below.</span>}</p>}
    <div className={'viewfinder '+(active?'is-active':'')+(locked?' guide-locked':'')} style={{aspectRatio:active?ratio:2.16}} tabIndex={active?0:undefined} role={active?'group':undefined} aria-label={active?(locked?'UPC scan area locked':'UPC scan area: drag to select, click to move, arrow keys to adjust'):undefined} onPointerDown={beginArea} onPointerMove={moveArea} onPointerUp={finishArea} onPointerCancel={()=>{dragStart.current=null;setSelecting(false);}} onKeyDown={moveAreaKey}>
      <video ref={video} autoPlay playsInline muted aria-label="Camera preview" hidden={!active} onResize={()=>{if(video.current?.videoWidth){setRatio(video.current.videoWidth/video.current.videoHeight);setInfo(i=>({...i,width:video.current.videoWidth,height:video.current.videoHeight}));}}}/>
      <div className={'scan-guide '+(target?'has-target':'')} style={active?{left:`${area.left*100}%`,top:`${area.top*100}%`,width:`${area.width*100}%`,height:`${area.height*100}%`}:undefined}><b/><b/><b/><b/>
        {!active&&<div className="camera-placeholder"><Camera size={58} strokeWidth={1.6}/><p>Scan the numbers beside “UPC Code”</p><span>Start the camera, then select just the digits</span></div>}
        {active&&!target&&<span className={'wire-label '+(area.top<.08?'label-below':'')+(area.left+area.width/2>.5?' label-right':'')}>UPC digits{locked?' · locked':''}</span>}
      </div>
      {active&&target&&<div className={'upc-wireframe '+target.phase} role="img" aria-label={`${target.phase==='captured'?'Captured':target.phase==='review'?'Needs review':'Confirming'} UPC ${target.code}`} style={{left:`${target.rect.left*100}%`,top:`${target.rect.top*100}%`,width:`${target.rect.width*100}%`,height:`${target.rect.height*100}%`}}><b/><b/><b/><b/><span className={'wire-label '+(target.rect.top<.08?'label-below':'')+(target.rect.left+target.rect.width/2>.5?' label-right':'')}>{target.phase==='captured'?<Check size={13}/>:null}{target.code}<small>{target.phase==='captured'?'Captured':target.phase==='review'?'Review':`${target.reads} of ${target.required} reads`}</small></span></div>}
      {!active&&!busy&&<div className="example">UPC Code: <strong>012345678905</strong><small>Example only</small></div>}
    </div>
    {(active||busy)&&<div className="scan-status" role="status">{busy&&!userPaused&&<LoaderCircle className="spin" size={16}/>} {userPaused?'Paused. Your batch is saved. Press Resume to keep scanning.':paused?'Scanning paused while you review your batch.':status}</div>}
    <div className="scanner-controls"><button className="button primary" onClick={active||starting?stop:start} disabled={busy&&!active}>{starting?<LoaderCircle className="spin"/>:active?<Square/>:<Video/>}{starting?'Cancel camera':active?'Stop camera':'Start camera'}</button><button className="button" onClick={()=>file.current.click()} disabled={active||busy||starting}><ImagePlus/>{busy&&!active?'Processing…':'Scan photo'}</button><input ref={file} hidden type="file" accept="image/jpeg,image/png,image/webp,image/bmp" onChange={scanPhoto} aria-label="Choose a photo of the frame UPC"/></div>
    {active&&<div className="batch-controls"><button className="button pause-button" onClick={()=>setUserPaused(v=>!v)}>{userPaused?<Play/>:<Pause/>}{userPaused?'Resume scanning':'Pause scanning'}</button><button className="complete-batch" onClick={()=>{stop();onComplete();}}><span className="green-check"><Check size={25} strokeWidth={3}/></span><span>Complete batch<small>Finish scanning & start transfer</small></span></button></div>}
    {active&&<FocusTools video={video} area={area} zoomedArea={autoZoom&&target?zoomArea(target.rect,area):null} autoZoom={autoZoom} onAutoZoom={()=>setAutoZoom(v=>!v)} info={info} locked={locked} onLock={()=>setLocked(v=>!v)} onEffects={removeEffects} onResize={width=>setArea(r=>resizeArea(r,width))} onReset={()=>{setArea(DEFAULT_AREA);refocus(DEFAULT_AREA);}} onFocus={()=>refocus()} onManualFocus={manualFocus}/>}
    {cameraMode==='browser'&&devices.length>1&&<label className="camera-select">Camera<select value={device} disabled={active||starting} onChange={e=>setDevice(e.target.value)}>{devices.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${i+1}`}</option>)}</select>{active&&<small>Stop the camera to switch.</small>}</label>}
    <p className="privacy"><LockKeyhole size={16}/>Only UPCs and transfer progress are saved. Photos stay on this device.</p>
    {error&&<p className="notice error" role="alert">{error}</p>}
    <details className="manual"><summary><Keyboard size={23}/>Enter a UPC manually<ChevronDown size={19}/></summary><form onSubmit={addManual}><label htmlFor="manual-upc">Frame UPC</label><div className="input-row"><input id="manual-upc" autoComplete="off" inputMode="numeric" placeholder="12–14 digits" value={manual} onChange={e=>setManual(e.target.value)}/><button className="button primary" type="submit"><Plus size={18}/>Add</button></div>{manualError&&<p className="field-error" role="alert">{manualError}</p>}</form></details>
    {photo&&<PhotoCrop photo={photo} onRead={readPhoto} onClose={closePhoto}/>}
  </section>;
}

