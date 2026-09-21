// Only retain numeric candidates and their geometry, never the surrounding document text.
const numericText=text=>String(text).replace(/[\s-]/g,'').replace(/[OIlSBZ]/g,c=>({O:'0',I:'1',l:'1',S:'5',B:'8',Z:'2'}[c]));
function union(boxes){
  const valid=boxes.filter(b=>b&&[b.x0,b.y0,b.x1,b.y1].every(Number.isFinite)&&b.x1>b.x0&&b.y1>b.y0);
  return valid.length?{x0:Math.min(...valid.map(b=>b.x0)),y0:Math.min(...valid.map(b=>b.y0)),x1:Math.max(...valid.map(b=>b.x1)),y1:Math.max(...valid.map(b=>b.y1))}:null;
}
export function codeBounds(data,code){
  for(const block of data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
    const words=line.words||[];
    const symbols=words.flatMap(w=>w.symbols||[]).map(s=>({text:numericText(s.text),bbox:s.bbox})).filter(s=>s.text);
    const text=symbols.map(s=>s.text).join('');
    const start=text.indexOf(code),end=start+code.length;
    if(start>=0&&!/\d/.test(text[start-1]||'')&&!/\d/.test(text[end]||'')){
      let offset=0;
      const boxes=symbols.filter(s=>{const match=offset<end&&offset+s.text.length>start;offset+=s.text.length;return match;}).map(s=>s.bbox);
      const box=union(boxes);if(box)return box;
    }
    // Some engines omit symbol detail. Use the matching digit words, not the label.
    for(let i=0;i<words.length;i++){
      let digits='';const boxes=[];
      for(let j=i;j<words.length;j++){
        const token=numericText(words[j].text);if(!/^\d+$/.test(token))break;
        digits+=token;boxes.push(words[j].bbox);
        if(digits===code)return union(boxes);
        if(digits.length>=code.length)break;
      }
    }
  }
  return null;
}
export function mapCodeBox(box,imageWidth,imageHeight,crop,videoWidth,videoHeight){
  if(!box||!imageWidth||!imageHeight||!videoWidth||!videoHeight)return null;
  // A little breathing room keeps the outline off the printed strokes.
  const pad=Math.max(2,(box.y1-box.y0)*.12);
  const x0=Math.max(0,box.x0-pad),y0=Math.max(0,box.y0-pad);
  const x1=Math.min(imageWidth,box.x1+pad),y1=Math.min(imageHeight,box.y1+pad);
  if(x1<=x0||y1<=y0)return null;
  return {left:(crop.x+x0/imageWidth*crop.width)/videoWidth,top:(crop.y+y0/imageHeight*crop.height)/videoHeight,width:(x1-x0)/imageWidth*crop.width/videoWidth,height:(y1-y0)/imageHeight*crop.height/videoHeight};
}
export function refineInkBox(image,box){
  if(!box||!image?.data)return box;
  const {width,height,data}=image,x0=Math.max(0,Math.floor(box.x0)),x1=Math.min(width,Math.ceil(box.x1)),y0=Math.max(0,Math.floor(box.y0)),y1=Math.min(height,Math.ceil(box.y1));
  const w=x1-x0,h=y1-y0;if(w<12||h<6)return box;
  const histogram=new Uint32Array(256),gray=new Uint8Array(w*h);
  let sum=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=((y+y0)*width+x+x0)*4,value=Math.round(data[p]*.299+data[p+1]*.587+data[p+2]*.114);
    gray[y*w+x]=value;histogram[value]++;sum+=value;
  }
  // Raw-line OCR sometimes reports the entire crop. Otsu separates dark ink
  // from the paper to tighten that geometry without altering or guessing digits.
  let weight=0,partial=0,best=0,threshold=0;
  for(let t=0;t<255;t++){
    weight+=histogram[t];partial+=t*histogram[t];
    if(!weight||weight===gray.length)continue;
    const distance=partial/weight-(sum-partial)/(gray.length-weight),score=weight*(gray.length-weight)*distance*distance;
    if(score>best){best=score;threshold=t;}
  }
  const rows=new Uint32Array(h),cols=new Uint32Array(w);let ink=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(gray[y*w+x]<=threshold){rows[y]++;cols[x]++;ink++;}
  if(ink<gray.length*.003||ink>gray.length*.55)return box;
  const xs=[],ys=[];
  for(let x=0;x<w;x++)if(cols[x]>=Math.max(2,h*.03))xs.push(x);
  for(let y=0;y<h;y++)if(rows[y]>=Math.max(3,w*.02))ys.push(y);
  if(!xs.length||!ys.length||xs.at(-1)-xs[0]<w*.3)return box;
  return {x0:x0+xs[0],y0:y0+ys[0],x1:x0+xs.at(-1)+1,y1:y0+ys.at(-1)+1};
}
export function frameDifference(a,b){
  if(!a||!b||a.length!==b.length||!a.length)return Infinity;
  // Ignore a small uniform exposure change, while retaining movement of the ink.
  let shift=0;for(let i=0;i<a.length;i++)shift+=b[i]-a[i];shift/=a.length;
  let difference=0;for(let i=0;i<a.length;i++)difference+=Math.abs(b[i]-a[i]-shift);
  return difference/a.length+Math.abs(shift)*.15;
}
export function createConfirmation({windowMs=10000}={}){
  let previous='',count=0,lastDelivered='',lastSeen=0,misses=0;
  function reset(){previous='';count=0;lastSeen=0;misses=0;}
  return {
    reset,
    observe(candidates,now=Date.now()){
      if(now-lastSeen>windowMs)reset();
      if(candidates.length!==1){if(candidates.length>1||++misses>=3)reset();return {phase:'searching',deliver:false,reads:count};}
      const candidate=candidates[0];
      const safe=candidate.valid&&candidate.trusted&&!candidate.corrected,key=`${candidate.code}:${Boolean(safe)}`,required=safe?2:4;
      count=key===previous?count+1:1;previous=key;lastSeen=now;misses=0;
      const confirmed=count>=required,deliver=confirmed&&lastDelivered!==key;
      if(deliver)lastDelivered=key;
      return {phase:confirmed?(safe?'captured':'review'):'confirming',deliver,reads:Math.min(count,required),required};
    }
  };
}

export function zoomArea(rect,outer){
  if(!rect)return outer;
  const padX=Math.max(rect.width*.12,.005),padY=Math.max(rect.height*.65,.005);
  const left=Math.max(outer.left,rect.left-padX),top=Math.max(outer.top,rect.top-padY);
  return {left,top,width:Math.min(outer.left+outer.width,rect.left+rect.width+padX)-left,height:Math.min(outer.top+outer.height,rect.top+rect.height+padY)-top};
}
