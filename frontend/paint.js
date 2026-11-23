export function paint(canvas, stats, frame) {
  const ctx = canvas.getContext('2d');
  const paper = '#fcfaf2', moss = '#2d492d', rust = '#884b21';
  function text(value, x, y, size, color, bold = false) {
    ctx.fillStyle = color;
    ctx.font = (bold ? '750 ' : '500 ') + size + 'px "Segoe UI",sans-serif';
    ctx.fillText(value, x, y, 940);
  }
  ctx.fillStyle = paper;
  ctx.fillRect(0,0,1080,1350);
  text('OpenSverige',64,105,66,moss,true);
  text('WRAPPED  /  2026',64,170,32,rust);
  ctx.fillStyle = moss;
  ctx.fillRect(0,220,1080,600);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0,220,1080,600);
  ctx.clip();
  ctx.strokeStyle = '#60775b';
  for (let i=1;i<22;i++) {
    ctx.beginPath();
    ctx.ellipse(1140,360,i*34,i*21,-0.6,0,2*Math.PI*Math.min(1,(frame+8)/55));
    ctx.stroke();
  }
  ctx.restore();
  text('Min hemmaplan',64,403,90,paper,true);
  text(stats.channels || 'OpenSverige',64,602,100,paper,true);
  text(stats.count.toLocaleString('sv-SE')+' inlägg',64,770,62,paper);
  ctx.globalAlpha = Math.min(1,Math.max(0,(frame-50)/20));
  text(stats.emoji ? 'Min signatur' : 'Mitt år i siffror',64,950,46,rust);
  text(stats.emoji || String(stats.days)+' aktiva dagar',64,1095,100,moss,true);
  if (stats.emoji) text(stats.uses+' gånger i mina inlägg',64,1170,48,moss);
  ctx.globalAlpha = 1;
  text(stats.name+'  /  2026 hittills',64,1290,36,moss);
}
