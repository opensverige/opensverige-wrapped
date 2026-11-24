import {motionFrame} from './motion-v3';
import {hand,avatarClip} from './brand';

let loading;
function loadHand() {
  loading ??= fetch(hand).then(async response=>{
    if(!response.ok) throw new Error('Kunde inte läsa omslagsbilden.');
    return createImageBitmap(await response.blob());
  }).catch(error=>{ loading=undefined;throw error; });
  return loading;
}
export async function loadImages(stats) {
  const avatar=stats.avatar && fetch(stats.avatar,{credentials:'omit',signal:AbortSignal.timeout(8000)})
    .then(response=>response.ok?response.blob():null)
    .then(blob=>blob && createImageBitmap(blob)).catch(()=>null);
  const [keyart,portrait]=await Promise.all([loadHand(),avatar]);
  return {keyart,portrait};
}

function draw(ctx,layer,images) {
  ctx.save();
  if(layer.radius!==null) {
    ctx.beginPath();ctx.arc(660,530,layer.radius,0,Math.PI*2);ctx.clip();
  }
  ctx.translate(540*(1-layer.scale),675*(1-layer.scale)+layer.y);
  ctx.scale(layer.scale,layer.scale);
  for(const {tag,props:p,value} of layer.elements) {
    if(tag==='image') {
      if(p.clipPath===avatarClip) {
        if(!images.portrait)continue;
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x+p.width/2,p.y+p.height/2,p.width/2,0,2*Math.PI);
        ctx.clip();
        ctx.drawImage(images.portrait,p.x,p.y,p.width,p.height);
        ctx.restore();
      } else ctx.drawImage(images.keyart,p.x,p.y,p.width,p.height);
    }
    else if(tag==='rect') {
      ctx.fillStyle=p.fill;
      if(p.rx) {
        ctx.beginPath();ctx.roundRect(p.x,p.y,p.width,p.height,p.rx);ctx.fill();
      } else ctx.fillRect(p.x,p.y,p.width,p.height);
    } else if(tag==='path') {
      ctx.strokeStyle=p.stroke;ctx.lineWidth=p.strokeWidth;ctx.stroke(new Path2D(p.d));
    } else if(tag==='text') {
      ctx.globalAlpha=p.opacity;
      ctx.fillStyle=p.fill;
      ctx.font=`${p.fontStyle} ${p.fontWeight} ${p.fontSize}px ${p.fontFamily}`;
      ctx.textAlign=p.textAnchor==='middle'?'center':'left';
      ctx.fillText(value,p.x,p.y);
      ctx.globalAlpha=1;
    }
  }
  ctx.restore();
}
let overlay;
export function paint(canvas,stats,frame,scenes,image) {
  const ctx=canvas.getContext('2d');
  for(const layer of motionFrame(stats,scenes,frame)) {
    if(layer.opacity===1) { draw(ctx,layer,image);continue; }
    if(layer.opacity===0) continue;
    overlay ??= new OffscreenCanvas(canvas.width,canvas.height);
    const other=overlay.getContext('2d');
    other.clearRect(0,0,overlay.width,overlay.height);
    draw(other,layer,image);
    ctx.save();ctx.globalAlpha=layer.opacity;ctx.drawImage(overlay,0,0);ctx.restore();
  }
}
