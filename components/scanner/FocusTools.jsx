import React,{useEffect,useRef,useState} from 'react';
import {Focus,ScanLine,LockKeyhole,Unlock} from 'lucide-react';
import {sourceRect} from './camera.mjs';

export default function FocusTools({video,area,zoomedArea,autoZoom,onAutoZoom,info,locked,onLock,onEffects,onResize,onReset,onFocus,onManualFocus}){
  const canvas=useRef(null),[distance,setDistance]=useState(info?.focusDistance??info?.manualRange?.min??0);
  const closeup=zoomedArea||area;
  useEffect(()=>{setDistance(info?.focusDistance??info?.manualRange?.min??0);},[info?.focusDistance,info?.manualRange?.min]);
  useEffect(()=>{
    const el=canvas.current,ctx=el.getContext('2d');
    function draw(){
      const source=video.current;if(!source?.videoWidth||source.readyState<2||document.hidden)return;
      const r=sourceRect(source.videoWidth,source.videoHeight,closeup);
      // An enlarged view of the exact native pixels passed to OCR; never a sharpened substitute.
      const scale=Math.min(1200/r.width,260/r.height,4),width=Math.max(1,Math.round(r.width*scale)),height=Math.max(1,Math.round(r.height*scale));
      if(el.width!==width||el.height!==height){el.width=width;el.height=height;}
      ctx.drawImage(source,r.x,r.y,r.width,r.height,0,0,width,height);
    }
    draw();const timer=setInterval(draw,160);return()=>clearInterval(timer);
  },[video,closeup.left,closeup.top,closeup.width,closeup.height]);
  const focusLabel=info?.native?'Document mode · portrait effects bypassed':info?.focusMode==='continuous'?'Autofocus active':info?.focusMode==='manual'?'Manual focus':info?.focusMode==='single-shot'?'Single-shot autofocus':info?.autoAvailable?'Autofocus requested':'Focus control unavailable in this browser';
  return <div className="focus-tools">
    <div className="focus-title"><span><ScanLine size={17}/>{zoomedArea?'Zoomed onto UPC':'UPC close-up'}</span><span>{info?.width&&info?.height?`${info.width} × ${info.height}`:'Checking camera…'}</span></div>
    <canvas ref={canvas} className="upc-closeup" aria-label="Magnified live UPC scan area"/>
    <div className="auto-zoom"><button className={'button guide-lock '+(autoZoom?'is-locked':'')} aria-pressed={autoZoom} onClick={onAutoZoom}><Focus size={16}/>{autoZoom?'Auto zoom on':'Auto zoom off'}</button><span>Find digits, tighten the crop, then confirm. Brief missed reads keep their progress.</span></div>
    <p className="focus-help">Keep <strong>the numbers beside “UPC Code”</strong> in the guide. A tight outline appears around the detected digits: amber while confirming, green when captured. Then show the next paper.</p>
    <div className="guide-actions"><button className={'button guide-lock '+(locked?'is-locked':'')} aria-pressed={locked} onClick={onLock}>{locked?<LockKeyhole size={16}/>:<Unlock size={16}/>} {locked?'Guide locked':'Lock guide'}</button><span>{locked?'The guide stays fixed as you swap papers. Unlock to adjust.':'Drag or click the video to position the guide; arrow keys work too.'}</span></div>
    <div className="area-controls"><label htmlFor="scan-area-width">Box width <span>{Math.round(area.width*100)}%</span></label><input id="scan-area-width" type="range" min="4" max="85" step="1" disabled={locked} value={Math.round(area.width*100)} onChange={e=>onResize(Number(e.target.value)/100)}/><button className="text-button" disabled={locked} onClick={onReset}>Center box</button></div>
    <div className="focus-state"><span>{focusLabel}</span>{info?.autoAvailable&&<button className="button refocus" onClick={onFocus}><Focus size={17}/>{info.focusMode==='manual'?'Use autofocus':'Refocus'}</button>}</div>
    {info?.manualRange&&<label className="manual-focus">Lens focus<input type="range" aria-label="Lens focus" min={info.manualRange.min} max={info.manualRange.max} step={info.manualRange.step||'any'} value={distance} onChange={e=>setDistance(Number(e.target.value))} onPointerUp={()=>onManualFocus(distance)} onKeyUp={()=>onManualFocus(distance)}/></label>}
    <p className="focus-tip">If the close-up looks soft, move the paper slightly farther away and hold still. Enlarging the preview cannot restore out-of-focus detail.</p>
    {!info?.native&&<details className="camera-effects"><summary>Blurry edges? Check camera effects</summary><p>{info?.backgroundBlur===false?'The camera reports background blur is off.':info?.backgroundBlur===true?'The camera reports background blur is still on.':'This browser cannot report whether the camera is applying background blur.'} FrameScan requests effects off when supported.</p><p>If the paper edges still blur, turn off <strong>Background blur / Portrait blur</strong> and <strong>Automatic framing</strong> in Windows Settings → Bluetooth &amp; devices → Cameras → your camera, or in your webcam’s app. These effects can blur a document as if it were background.</p><button className="button refocus" onClick={onEffects}>Retry without camera effects</button><a href="https://support.microsoft.com/en-us/windows/ai/ai-features/windows-studio-effects" target="_blank" rel="noreferrer">Windows camera effects help</a></details>}
  </div>;
}
