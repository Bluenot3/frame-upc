import { createWorker, PSM } from 'tesseract.js';
import {recognizeUpc} from './recognition.mjs';
import {DEFAULT_AREA,sourceRect} from './camera.mjs';

// All model files, workers and WASM are served from this local app.
export function createScanner(onProgress) {
  let workerPromise;
  let disposed=false;
  async function getWorker() {
    if(disposed) throw new Error('Scanner closed.');
    if (!workerPromise) workerPromise=createWorker('eng',1,{
      workerPath:'/ocr/worker.min.js',corePath:'/ocr',langPath:'/ocr',
      workerBlobURL:false,cacheMethod:'none',
      logger:message=>{if(!disposed)onProgress?.(message);}
    }).then(async worker=>{
      if(disposed){await worker.terminate();throw new Error('Scanner closed.');}
      await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,user_defined_dpi:'150',preserve_interword_spaces:'1'});
      return worker;
    }).catch(error=>{workerPromise=null;throw error;});
    return workerPromise;
  }
  return {
    async recognize(canvas,guide=false,shouldCancel) {
      const worker=await getWorker();
      return recognizeUpc(worker,canvas,guide,{shouldCancel});
    },
    async dispose(){disposed=true;if(workerPromise)await workerPromise.then(w=>w.terminate()).catch(()=>{});}
  };
}

export function captureGuide(video,area=DEFAULT_AREA) {
  const {videoWidth:w,videoHeight:h}=video;
  if(!w||!h) return null;
  // Video container uses this exact intrinsic aspect ratio; object-fit introduces no crop.
  const r=sourceRect(w,h,area);
  return prepareImage(video,r.x,r.y,r.width,r.height,1400);
}
export async function captureBestGuide(video,area){
  const probe=document.createElement('canvas');probe.width=240;probe.height=60;
  const context=probe.getContext('2d',{willReadFrequently:true});
  let best=null,bestScore=-1;
  for(let shot=0;shot<3;shot++){
    if(shot)await new Promise(resolve=>setTimeout(resolve,45));
    const candidate=captureGuide(video,area);if(!candidate)return best;
    context.drawImage(candidate,0,0,240,60);
    const pixels=context.getImageData(0,0,240,60).data;let score=0;
    for(let y=1;y<59;y++)for(let x=1;x<239;x++){
      const i=(y*240+x)*4,edge=pixels[i]*4-pixels[i-4]-pixels[i+4]-pixels[i-960]-pixels[i+960];score+=edge*edge;
    }
    if(score>bestScore){best=candidate;bestScore=score;}
  }
  return best;
}
export function createFrameSampler(){
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=48;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  return (video,area)=>{
    if(!video?.videoWidth||video.readyState<2)return null;
    const r=sourceRect(video.videoWidth,video.videoHeight,area);
    ctx.drawImage(video,r.x,r.y,r.width,r.height,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,gray=new Uint8Array(canvas.width*canvas.height);
    for(let i=0;i<gray.length;i++)gray[i]=Math.round(pixels[i*4]*.299+pixels[i*4+1]*.587+pixels[i*4+2]*.114);
    return gray;
  };
}
export function prepareImage(image,x,y,width,height,target=2800) {
  const scale=width>=1000?1:Math.min(4,target/width);
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(image,x,y,width,height,0,0,canvas.width,canvas.height);
  return canvas;
}
