import {fps, scenes, secondsPerScene, theme} from './design';
export function paint(canvas, stats, frame) {
  const ctx = canvas.getContext('2d');
  const elapsed = frame / fps;
  const index = Math.min(scenes.length-1, Math.floor(elapsed/secondsPerScene));
  const local = elapsed-index*secondsPerScene;
  const scene = scenes[index];
  const [bg,ink,accent] = scene.colors.map(key=>theme[key]);
  ctx.fillStyle=bg;
  ctx.fillRect(0,0,1080,1350);
  // Each scene has its own moving contour pattern and a quiet area for type.
  ctx.save();
  ctx.strokeStyle=accent;
  ctx.lineWidth=5;
  for(let ring=1;ring<=17;ring++) {
    ctx.beginPath();
    ctx.ellipse(index%2 ? 160 : 890,300+18*Math.sin(local*.65),ring*37,ring*(14+index),-.42,0,Math.PI*2*Math.min(1,(local+.25)/1.25));
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle=bg;
  ctx.fillRect(0,545,1080,805);
  function label(text,y,size,color,weight) {
    ctx.fillStyle=color;
    ctx.font=weight+' '+size+'px '+theme.font;
    ctx.fillText(text,68,y,944);
  }
  const resolve = field=>typeof field==='function'?field(stats):field;
  label('OpenSverige   /   Wrapped 2026',104,39,ink,650);
  ctx.save();
  const enter=Math.min(1,local/.65);
  ctx.translate(0,48*(1-enter)**2);
  ctx.globalAlpha=Math.max(.1,enter);
  label(resolve(scene.title),695,65,ink,600);
  if (stats.memory && index === 3) {
    ctx.font = '800 65px '+theme.font;
    const lines = [''];
    for (const word of stats.memory.title.split(/\s+/)) {
      const candidate = (lines.at(-1)+' '+word).trim();
      if (lines.at(-1) && ctx.measureText(candidate).width > 944) lines.push(word);
      else lines[lines.length-1] = candidate;
    }
    lines.forEach((line,i)=>label(line,790+i*70,65,ink,800));
  } else label(scene.value(stats),925,157,ink,800);
  label(scene.detail(stats),1022,47,ink,550);
  ctx.restore();
  ctx.fillStyle=accent;
  ctx.fillRect(68,1184,944*Math.min(1,(local+.1)/secondsPerScene),9);
  label(stats.name+'   /   2026 hittills',1270,35,ink,500);
}
