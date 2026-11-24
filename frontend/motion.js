import {spring} from 'remotion';
import {fps} from './design';
import {motionFrame as motionV3} from './motion-v3';
import {hand,profileAvatar} from './brand';

const ink='#191918';
const serif='Georgia, serif', sans='Arial, sans-serif', mono='Consolas, monospace';
const palettes=[
  {ground:'#e1e9d6', shape:'#215641', accent:'#dcff80'},
  {ground:'#f5d4ae', shape:'#984229', accent:'#ffe8b9'},
  {ground:'#dadff8', shape:'#333e7d', accent:'#f5c3eb'},
];
const months=['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const p=clamp(x);return p*p*(3-2*p);};
const transition=18;
let context;
function textWidth(value,size,weight,family,style) {
  context ??= new OffscreenCanvas(1,1).getContext('2d');
  context.font=`${style} ${weight} ${size}px ${family}`;
  return context.measureText(value).width;
}
function layout(stats,scenes,index,local) {
  const scene=scenes[index], cover=index===0, closing=index===scenes.length-1;
  const stat=scene.kind==='stat' && !cover && !closing, quote=scene.kind==='quote';
  const motif=scene.storyIndex ?? scenes.slice(0,index).filter(s=>s.kind==='stat').length;
  const colors=stats.theme?.colors;
  const paper=colors?.paper || '#fbfaf7',rust=colors?.rust || '#ac3917';
  const green=colors?.green || '#215641',lime=colors?.lime || '#dcff80';
  const pulse=stats.theme?.layout==='pulse';
  const p=colors ? [{ground:paper,shape:green,accent:lime},{ground:lime,shape:green,accent:paper},
    {ground:paper,shape:rust,accent:green}][motif%3] : palettes[motif%palettes.length];
  const pulseBg=cover || closing ? green : [paper,lime,rust,green][index%4];
  const darkPulse=pulseBg===green || pulseBg===rust;
  const bg=pulse ? pulseBg : quote?ink:stat?p.ground:paper;
  const fg=pulse ? (darkPulse?paper:ink) : quote?paper:ink;
  const entered=spring({frame:local,fps,config:{damping:24,stiffness:82}});
  const t=local/fps, elements=[];
  const add=(tag,props,value)=>elements.push({tag,props,value});
  const rect=(x,y,width,height,fill,rx=0)=>add('rect',{x,y,width,height,fill,rx});
  const stroke=(points,color,width)=>add('path',{d:points.map(([x,y],j)=>(j?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)).join(' '),fill:'none',stroke:color,strokeWidth:width});
  const text=(value,x,y,fontSize,fill=fg,fontWeight=700,fontFamily=sans,fontStyle='normal',opacity=1)=>
    add('text',{x,y,fontSize,fill,fontWeight,fontFamily,fontStyle,opacity},value);
  function block(value,x,y,width,height,maxSize,{family=sans,weight=700,color=fg,style='normal',delay=0}={}) {
    const words=String(value || '').trim().split(/\s+/);
    let rows, size=maxSize;
    for(;;size-=2) {
      rows=[''];
      for(const word of words) {
        const row=rows.at(-1),next=row?row+' '+word:word;
        if(row && textWidth(next,size,weight,family,style)>width) rows.push(word);
        else rows[rows.length-1]=next;
      }
      if(size<=8 || (rows.length*size*1.13<=height && rows.every(row=>textWidth(row,size,weight,family,style)<=width)))break;
    }
    rows.forEach((row,j)=>{
      const progress=smooth((local-delay-j*2)/14);
      text(row,x,y+size*(.91+j*1.13)+(1-progress)*32,size,color,weight,family,style,progress);
    });
  }
  // Measure a packet's position along the trace so its speed is steady through bends.
  function packet(points,phase,size,color) {
    const lengths=points.slice(1).map(([x,y],i)=>Math.hypot(x-points[i][0],y-points[i][1]));
    let distance=phase*lengths.reduce((sum,n)=>sum+n,0);
    for(let i=0;i<lengths.length;i++) {
      if(distance<=lengths[i] && lengths[i]>0) {
        const [x,y]=points[i], fraction=distance/lengths[i];
        rect(x+(points[i+1][0]-x)*fraction-size/2,y+(points[i+1][1]-y)*fraction-size/2,size,size,color,2);
        return;
      }
      distance-=lengths[i];
    }
  }
  function inferenceChain(cx,cy) {
    const columns=[[0],[-75,75],[-110,0,110],[0]];
    const xs=[-170,-63,55,170];
    const cycle=t*.41;
    for(let column=0;column<columns.length-1;column++) {
      for(const a of columns[column]) for(const b of columns[column+1]) {
        if(Math.abs(a-b)>115)continue;
        const x=cx+xs[column], end=cx+xs[column+1];
        const path=[[x,cy+a],[x+26,cy+a],[end-26,cy+b],[end,cy+b]];
        stroke(path,p.shape,3);
        const phase=(cycle*3+3-column)%3;
        if(phase<1)packet(path,phase,14,p.shape);
      }
    }
    columns.forEach((ys,column)=>ys.forEach(offset=>{
      const x=cx+xs[column],y=cy+offset;
      const phase=(cycle*3+3-column)%3;
      const glow=Math.max(0,1-Math.min(phase,3-phase)*2.2);
      const size=(column===0 || column===3 ? 40 : 30)+6*glow;
      rect(x-size/2,y-size/2,size,size,p.shape,7);
      rect(x-size/2+4,y-size/2+4,size-8,size-8,p.ground,4);
      const bit=8+9*glow;
      rect(x-bit/2,y-bit/2,bit,bit,glow>.4?p.shape:p.accent,2);
    }));
  }
  function dataBus(y,trace,highlight,board) {
    // Seven parallel lanes fan out, enter a chip, and carry its output onward.
    for(let lane=-3;lane<=3;lane++) {
      const port=lane*14, fan=lane*34;
      const left=[[77,y+port],[143,y+port],[218,y+fan],[315,y+fan],[407,y+port],[474,y+port]];
      const right=left.map(([x,py])=>[1080-x,py]).reverse();
      stroke(left,trace,3.5);stroke(right,trace,3.5);
      for(const x of [77,1003])rect(x-5,y+port-5,10,10,trace,2);
      const phase=(t*.29+(lane+3)*.138)%1;
      packet(phase<.5?left:right,(phase*2)%1,15,trace);
    }
    rect(466,y-72,148,144,trace,17);
    rect(471,y-67,138,134,board,13);
    rect(487,y-51,106,102,trace,8);
    // A diagonal sweep through a 5 × 5 register reads at phone size.
    for(let row=0;row<5;row++)for(let col=0;col<5;col++) {
      const phase=(t*.44+(row+col)/9)%1;
      const side=6+8*(.5-.5*Math.cos(phase*2*Math.PI));
      rect(504+col*18-side/2,y-36+row*18-side/2,side,side,highlight,2);
    }
  }
  function ribbon() {
    const y=751;
    rect(0,y,1080,75,ink);
    const value='OpenSverige   /   '+stats.name+'   ·   ';
    const pitch=textWidth(value,38,600,mono,'normal');
    for(let x=-((local*2)%pitch);x<1080;x+=pitch)text(value,x,y+50,38,paper,600,mono);
    rect(407,y-12,266,99,ink,50);rect(410,y-9,260,93,paper,46);
    text('Wrapped',437,y+56,54,ink,400,serif,'italic');
  }
  rect(0,0,1080,1350,bg);
  add('image',{href:hand,x:49,y:19,width:86,height:86});
  text('OpenSverige.se',143,86,48);
  text('WRAPPED / 2026',744,81,31,fg,500,mono);
  rect(62,119,956,2,quote?'#525149':'#bcb9b0');
  const date=/^(\d{4})-(\d\d)-(\d\d)/.exec(scene.source || '');
  const dateLabel=date?Number(date[3])+' '+months[Number(date[2])-1]:'';
  const channel=scene.source?.split('#').at(1)?.replace(/^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_-]+$/gu,'');
  const source=[dateLabel,channel?'#'+channel:''].filter(Boolean).join('   /   ');
  if(pulse) {
    const color=darkPulse?lime:green;
    if(cover || closing || scene.kind==='project') {
      for(let j=0;j<8;j++) {
        const w=(930-83*j)*entered,h=(375-32*j)*entered;
        const x=(1080-w)/2+12*Math.sin(t*1.8+j*.4),y=360-h/2;
        rect(x,y,w,h,color,20);
        if(w>10 && h>10)rect(x+4,y+4,w-8,h-8,bg,17);
      }
      text(cover?'2026':closing?'→':'</>',cover?475:495,382,54,fg,700,mono);
    } else {
      dataBus(350,color,bg,bg);
    }
    block(cover?'OPENSVERIGE / WRAPPED':closing?'OPENSVERIGE / 2026':scene.title.toLocaleUpperCase('sv-SE'),
      66,610,945,100,35,{family:mono,weight:500});
    const numeric=stat && /^(\d[\d\s]*)(.*)$/.exec(scene.value);
    const value=closing?'Vi har bara börjat.':numeric?Math.round(Number(numeric[1].replace(/\s/g,''))*smooth(local/25)).toLocaleString('sv-SE')+numeric[2]:scene.value;
    block(value,64,731,950,236,112,{delay:4});
    block(cover?'Ett år i OpenSverige.':scene.detail,67,983,940,175,49,{weight:400,delay:10});
    if(source)block(source,67,1167,940,62,29,{family:mono,weight:500});
  } else if(cover) {
    add('image',{href:hand,x:528+65*(1-entered),y:151+8*Math.sin(t*.9),width:700,height:700});
    block('Ett',62,188,550,170,150);
    block('byggarår.',62,353,640,178,132,{family:serif,weight:400,color:rust,style:'italic',delay:4});
    rect(0,822,1080,530,paper);
    ribbon();
    block(stats.name,63,911,954,170,140,{delay:13});
    text('i OpenSverige',66,1142,65,rust,400,serif,'italic');
  } else if(closing) {
    const entries=Object.entries(stats.months || {}).filter(([m,n])=>/^2026-\d\d$/.test(m)&&n>0).sort();
    block('Året i siffror',62,177,954,115,95,{family:serif,weight:400,style:'italic',color:rust});
    if(entries.length) {
      const pitch=940/entries.length, max=Math.max(...entries.map(([,n])=>n));
      text('INLÄGG PER MÅNAD',66,407,30,ink,500,mono);
      entries.forEach(([m,n],j)=>{
        const rise=smooth((local-5-j*2)/24), h=211*n/max*rise,x=66+j*pitch;
        const width=Math.min(pitch*.68,100);
        rect(x,720-h,width,h,n===max?rust:ink);
        // An inset highlight moves across each bar without changing its value.
        const shine=width*.22;
        const sweep=.5+.5*Math.sin(t*1.6-j*.55);
        if(h>8)rect(x+(width-shine)*sweep,720-h+3,shine,3,paper);
        text(String(n),x,703-h,24,ink,500,mono);
        text(m.slice(-2),x,765,25,ink,500,mono);
      });
    } else add('image',{href:hand,x:413,y:312+10*Math.sin(t*1.4),width:495,height:495});
    block(scene.detail,65,890,950,265,92,{delay:16});
  } else if(quote) {
    text('”',59,477+25*(1-entered)+9*Math.sin(t*1.6),354,'#dcff89',400,serif);
    block(scene.title,67,177,950,102,61,{family:serif,weight:400,style:'italic'});
    block(scene.value.replace(/^”|”$/g,''),64,450,949,530,116,{delay:9});
    block(source,67,1095,930,75,35,{family:mono,weight:500,color:'#dcff89',delay:20});
  } else if(stat) {
    block(scene.title,64,183,948,127,78,{family:serif,weight:400,style:'italic'});
    dataBus(469,p.shape,p.accent,bg);
    const numeric=/^(\d[\d\s]*)(.*)$/.exec(scene.value);
    const headline=numeric?Math.round(Number(numeric[1].replace(/\s/g,''))*smooth(local/32)).toLocaleString('sv-SE')+numeric[2]:scene.value;
    block(headline,60,666,958,270,146,{delay:4});
    block(scene.detail,65,976,938,148,53,{weight:400,delay:17});
    if(source)block(source,66,1142,932,66,32,{family:mono,weight:500,delay:20});
  } else {
    const variant=motif%3;
    rect(63,166,954,375,p.ground,24);
    if(variant===0) {
      inferenceChain(769,355);
      if(date) {
        text(date[3],104,408,178,p.shape,700);
        text(months[Number(date[2])-1],111,477,57,p.shape,400,serif,'italic');
      }
    } else if(variant===1) {
      // Nested frames echo a project window opening into the next.
      for(let j=0;j<9;j++) {
        const inset=j*19+8*Math.sin(t*.65+j*.24);
        rect(98+inset*1.6,193+inset*.69,884-inset*3.2,320-inset*1.42,j%2?p.ground:p.shape,18);
      }
      const width=204+20*Math.sin(t*.7);
      rect(540-width/2,311,width,78,p.accent,39);
      text('</>',492,367,48,p.shape,600,mono);
    } else {
      for(let j=0;j<12;j++){
        const pts=[];
        for(let k=0;k<=58;k++) {
          const u=k/58;
          pts.push([79+920*u,307+j*9+Math.sin(u*6.28+t*.6+j*.16)*87]);
        }
        stroke(pts,j%3?p.shape:ink,5);
      }
    }
    block(scene.title,65,599,950,95,52,{family:serif,weight:400,color:p.shape,style:'italic',delay:3});
    block(scene.value,61,702,958,228,100,{delay:7});
    block(scene.detail,66,958,942,174,51,{weight:400,delay:21});
    if(source)block(source,66,1156,943,58,29,{family:mono,weight:500,color:p.shape,delay:25});
  }
  const pitch=950/scenes.length;
  for(let j=0;j<scenes.length;j++)
    rect(65+j*pitch,1247,pitch-6,4,j<index?fg:quote?'#54534e':'#c2beb5');
  rect(65+index*pitch,1244,(pitch-6)*clamp(local/scene.frames),8,fg);
  profileAvatar(elements,stats,65,1268,61,fg,bg);
  block(stats.name,142,1275,680,45,39,{weight:700});
  text(String(index+1).padStart(2,'0')+' / '+String(scenes.length).padStart(2,'0'),873,1304,29,fg,500,mono);
  return elements;
}

export function motionFrame(stats,scenes,frame) {
  if(stats.theme?.layout==='motion-v3')return motionV3(stats,scenes,frame);
  const index=Math.max(0,scenes.findLastIndex(scene=>scene.start<=frame));
  const scene=scenes[index],local=frame-scene.start;
  function layer(i,f,scale=1,y=0,opacity=1,radius=null) {
    return {elements:layout(stats,scenes,i,f),scale,y,opacity,radius};
  }
  const lead=index===0?0:transition;
  if(index===scenes.length-1 || local<scene.frames-transition)
    return [layer(index,local+lead)];
  const nextFrame=local-scene.frames+transition;
  const blend=smooth(nextFrame/(transition-1));
  const outgoing=layer(index,local+lead,1+.035*blend);
  if(index%3===1) return [outgoing,layer(index+1,nextFrame,1,0,1,blend*1120)];
  return [outgoing,layer(index+1,nextFrame,1+.055*(1-blend),32*(1-blend),blend)];
}
