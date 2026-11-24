import React from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '@remotion/player';
import {Html5Audio, Sequence, useCurrentFrame} from 'remotion';

import {motionFrame} from './motion';
import {paint as paintPoster} from './poster';
import {fps,buildScenes,totalFrames,filmTrack,musicSections} from './design';
function YearCard({stats,scenes}) {
  const frame=useCurrentFrame();
  const track=filmTrack(stats);
  return <>{track && musicSections(totalFrames(scenes),track.frames).map(part=><Sequence key={part.start} from={part.start} durationInFrames={part.frames} layout="none">
    <Html5Audio src={track.src} trimBefore={part.from}/>
  </Sequence>)}<svg viewBox="0 0 1080 1350" width="100%" height="100%" xmlSpace="preserve" role="img" aria-label={stats.name+' · Wrapped 2026'}>
    <defs><clipPath id="wrapped-avatar-circle" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath></defs>
    {motionFrame(stats,scenes,frame).map(({elements,scale,y,opacity,radius},layer)=><React.Fragment key={layer}>
      {radius!==null && <defs><clipPath id="year-iris"><circle cx="660" cy="530" r={radius}/></clipPath></defs>}
      <g opacity={opacity} clipPath={radius!==null?'url(#year-iris)':undefined}>
        <g transform={`translate(${540*(1-scale)} ${675*(1-scale)+y}) scale(${scale})`}>
          {elements.map(({tag:Shape,props,value},i)=>Shape==='image'
            ? <image key={i+props.href} {...props} onError={event=>event.currentTarget.style.visibility='hidden'}/>
            : <Shape key={i} {...props}>{value}</Shape>)}
        </g>
      </g>
    </React.Fragment>)}
  </svg></>;
}
let root;
let currentWorker;
let themePreview;
window.previewTheme=(host,theme)=>{
  themePreview ??= createRoot(host);
  const stats={name:'Exempelmedlem',avatar:'https://cdn.discordapp.com/embed/avatars/2.png',messages:120,days:25,channels:'#verkstaden',count:70,uses:0,months:{'2026-04':50,'2026-05':70},
    stories:[{kind:'project',title:'Från skiss till testrunda',story:'En första prototyp blev redo för test i verkstaden.',date:'2026-05-04',channel:'verkstaden'}],theme};
  if(theme.layout==='motion-v3')Object.assign(stats,{
    activity:{longestStreak:12},emoji:'😂',uses:18,
    stories:[...stats.stories,{kind:'quote',story:'Den startade på första försöket. Nu blir jag misstänksam.',date:'2026-05-09',channel:'verkstaden'}]
  });
  const scenes=buildScenes(stats);
  themePreview.render(<Player key={theme.id+'-'+theme.layout+'-'+(theme.track?.src||'')} component={YearCard} inputProps={{stats,scenes}}
    durationInFrames={totalFrames(scenes)} compositionWidth={1080} compositionHeight={1350}
    fps={fps} controls style={{width:'100%',aspectRatio:'4/5'}}/>);
};
function ScriptPreview({stats,onCreate}) {
  const [excluded,setExcluded]=React.useState(new Set());
  function toggle(index) {
    setExcluded(previous=>{
      const next=new Set(previous);
      if(next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }
  const stories=stats.stories || [];
  const selected={...stats,stories:stories.filter((_,i)=>!excluded.has(i))};
  const scenes=buildScenes(selected);
  const seconds=Math.round(totalFrames(scenes)/fps);
  return <div className="script-preview"><h2>Läs ditt filmmanus</h2>
    <p>Scenerna visas i filmens ordning. Du kan ta bort en berättelse innan du skapar filmen.</p>
    <ol>{scenes.map((scene,i)=><li key={i}>
      {scene.storyIndex===undefined ? <strong>{scene.title}</strong> :
        <label><input type="checkbox" checked aria-label={'Ta med '+scene.value} onChange={()=>toggle(stories.indexOf(selected.stories[scene.storyIndex]))}/> {scene.title}</label>}
      <div>{scene.value}</div>{scene.detail && <p>{scene.detail}</p>}{scene.source && <small>{scene.source}</small>}
    </li>)}</ol>
    {excluded.size>0 && <details><summary>Bortvalda berättelser ({excluded.size})</summary>
      {[...excluded].map(i=><label key={i}><input type="checkbox" checked={false} onChange={()=>toggle(i)}/> {stories[i].title}</label>)}
    </details>}
    <button onClick={()=>onCreate(selected)}>Skapa min film · {Math.floor(seconds/60)} min {seconds%60} s</button>
  </div>;
}
window.showYear = stats => {
  const host = document.querySelector('#year-preview');
  root ??= createRoot(host);
  currentWorker?.terminate();
  currentWorker=undefined;
  for(const id of ['year-download','year-video']) document.getElementById(id).hidden=true;
  document.getElementById('video-status').textContent='';
  root.render(<ScriptPreview key={JSON.stringify(stats)} stats={stats} onCreate={playYear}/>);
};
function playYear(stats) {
  const scenes = buildScenes(stats);
  root.render(<Player key={JSON.stringify(scenes)} component={YearCard} inputProps={{stats,scenes}}
    durationInFrames={totalFrames(scenes)} compositionWidth={1080} compositionHeight={1350}
    fps={fps} controls style={{width:'100%',maxWidth:440,aspectRatio:'4/5'}}/>);
  const video = document.querySelector('#year-video');
  const status = document.querySelector('#video-status');
  video.hidden = false;
  video.disabled = false;
  video.onclick = () => {
    video.disabled = true;
    status.textContent = 'Skapar video …';
    let worker;
    function finish(message) {
      status.textContent = message;
      video.disabled = false;
      worker?.terminate();
      currentWorker=undefined;
    }
    try {
      worker = new Worker('/static/year-export.js');
      currentWorker=worker;
      worker.onmessage = ({data}) => {
        if (data.error) return finish('Videoexporten misslyckades. Försök igen i en uppdaterad webbläsare.');
        if (!data.file) {
          status.textContent = 'Skapar video · ' + data.percent + ' %';
          return;
        }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(data.file);
        link.download = 'mitt-opensverige-2026.mp4';
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 60000);
        finish('Din MP4 är klar.');
      };
      worker.onerror = () => finish('Kunde inte skapa videon. Försök igen.');
      worker.postMessage(stats);
    } catch {
      finish('Webbläsaren kunde inte starta videoexporten.');
    }
  };
  const download = document.querySelector('#year-download');
  download.hidden = false;
  download.onclick = async () => {
    const canvas = document.createElement('canvas');
    canvas.width=1080; canvas.height=1350;
    try {
      await paintPoster(canvas,stats);
    } catch {
      status.textContent='Kunde inte skapa kortet. Försök igen.';
      return;
    }
    const link = document.createElement('a');
    link.download='mitt-opensverige-2026.png';
    link.href=canvas.toDataURL('image/png');
    link.click();
  };
}
