import {extractCodes} from './upc.mjs';
import {codeBounds,refineInkBox} from './targeting.mjs';

function cropAttempt(image,box,digitHeight,mode,enhance=false,padding=.4){
  const h=box.y1-box.y0,pad=padding?Math.max(3,h*padding):0;
  const x=Math.max(0,box.x0-pad),y=Math.max(0,box.y0-pad),w=Math.min(image.width,box.x1+pad)-x,hh=Math.min(image.height,box.y1+pad)-y;
  const scale=Math.min(4,digitHeight/h),canvas=image.ownerDocument.createElement('canvas');
  canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(hh*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,x,y,w,hh,0,0,canvas.width,canvas.height);
  if(enhance){
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),data=pixels.data,gray=new Float32Array(data.length/4),histogram=new Uint32Array(256);
    for(let i=0;i<gray.length;i++){const p=i*4;gray[i]=Math.round(data[p]*.299+data[p+1]*.587+data[p+2]*.114);histogram[gray[i]]++;}
    let low=0,high=255,count=0;
    for(let i=0;i<256;i++){count+=histogram[i];if(count>=gray.length*.03){low=i;break;}}
    count=0;for(let i=255;i>=0;i--){count+=histogram[i];if(count>=gray.length*.03){high=i;break;}}
    const range=Math.max(30,high-low),width=canvas.width;
    for(let i=0;i<gray.length;i++){
      const neighbors=(gray[Math.max(0,i-width)]+gray[Math.min(gray.length-1,i+width)]+gray[i%width?i-1:i]+gray[(i+1)%width?Math.min(gray.length-1,i+1):i])/4;
      const value=Math.max(0,Math.min(255,(gray[i]+.65*(gray[i]-neighbors)-low)*255/range));
      data[i*4]=data[i*4+1]=data[i*4+2]=value;
    }
    ctx.putImageData(pixels,0,0);
  }
  return {image:canvas,mode,x,y,sx:canvas.width/w,sy:canvas.height/hh};
}

export async function recognizeUpc(worker,image,guide=false,{shouldCancel=()=>false}={}){
  const found=new Map(),votes=new Map();let pixels,ambiguous=false;
  const attempts=[{mode:guide?'13':'11',image,x:0,y:0,sx:1,sy:1}];
  if(guide&&image.width>900&&image.ownerDocument){
    const smaller=image.ownerDocument.createElement('canvas');smaller.width=600;smaller.height=Math.max(1,Math.round(image.height*600/image.width));
    smaller.getContext('2d').drawImage(image,0,0,smaller.width,smaller.height);
    attempts.push({mode:'13',image:smaller,x:0,y:0,sx:600/image.width,sy:smaller.height/image.height});
  }
  // Read tightly cropped ink at several character sizes without inventing digits.
  if(guide&&image.getContext&&image.ownerDocument){
    pixels=image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,image.width,image.height);
    let box={x0:0,y0:0,x1:image.width,y1:image.height},paperBox;
    // A grey paper patch against a white margin can be the first foreground.
    // Refine again inside it to isolate the darker printed digit strokes.
    for(let pass=0;pass<3;pass++){
      const next=refineInkBox(pixels,box);
      if(next.x0===box.x0&&next.x1===box.x1&&next.y0===box.y0&&next.y1===box.y1)break;
      box=next;
      paperBox??=box;
    }
    if(paperBox&&paperBox.y1-paperBox.y0>4)attempts.push(cropAttempt(image,paperBox,136,'13',false,0));
    if(box&&box.y1-box.y0>4&&box.x1-box.x0>30){
      attempts.push(cropAttempt(image,box,54,'7'),cropAttempt(image,box,54,'13'),cropAttempt(image,box,54,'7',true),cropAttempt(image,box,34,'13'),cropAttempt(image,box,80,'7',true));
    }
  }
  if(guide)for(const mode of ['7','6'])attempts.push({mode,image,x:0,y:0,sx:1,sy:1});
  for(const attempt of attempts){
    if(shouldCancel())throw new Error('Recognition cancelled.');
    await worker.setParameters({tessedit_pageseg_mode:attempt.mode,tessedit_char_whitelist:guide?'0123456789':''});
    const {data}=await worker.recognize(attempt.image,{}, {text:true,blocks:true});
    if(shouldCancel())throw new Error('Recognition cancelled.');
    const candidates=extractCodes(data.text,{guide}).map(candidate=>{
      const box=codeBounds(data,candidate.code);
      return {...candidate,box:box?{x0:attempt.x+box.x0/attempt.sx,y0:attempt.y+box.y0/attempt.sy,x1:attempt.x+box.x1/attempt.sx,y1:attempt.y+box.y1/attempt.sy}:null};
    });
    if(candidates.length>1)ambiguous=true;
    if(candidates.length&&image.getContext){
      pixels??=image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,image.width,image.height);
      for(const candidate of candidates)candidate.box=refineInkBox(pixels,candidate.box);
    }
    for(const candidate of candidates){found.set(candidate.code,candidate);votes.set(candidate.code,(votes.get(candidate.code)||0)+1);}
    if(candidates.some(c=>c.valid))return candidates;
  }
  const results=[...found.values()];
  // Failed enhancement attempts are alternative readings of one number, not
  // evidence of several UPCs. The strongest invalid candidate still needs review.
  return guide&&!ambiguous?results.sort((a,b)=>votes.get(b.code)-votes.get(a.code)).slice(0,1):results;
}
