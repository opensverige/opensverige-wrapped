import React, {useLayoutEffect, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '@remotion/player';
import {Html5Audio, useCurrentFrame} from 'remotion';

import {paint} from './paint';
import {paint as paintPoster} from './poster';
import {fps,frames,soundtrack} from './design';
function YearCard({stats}) {
  const ref = useRef(null);
  const frame = useCurrentFrame();
  useLayoutEffect(() => paint(ref.current,stats,frame),[stats,frame]);
  return <><Html5Audio src={soundtrack}/><canvas ref={ref} width={1080} height={1350} style={{width:'100%',height:'100%'}}/></>;
}
let root;
window.showYear = stats => {
  const host = document.querySelector('#year-preview');
  root ??= createRoot(host);
  const editor = document.querySelector('#memory-editor');
  function render(start = 0) {
    root.render(<Player key={JSON.stringify(stats.memory || null)} initialFrame={start}
      component={YearCard} inputProps={{stats:{...stats}}} durationInFrames={frames}
      compositionWidth={1080} compositionHeight={1350} fps={fps} controls
      style={{width:'100%',maxWidth:440,aspectRatio:'4/5'}}/>);
  }
  if (editor) {
    editor.hidden = false;
    const form = editor.querySelector('#memory-form');
    const review = editor.querySelector('#memory-review');
    const select = editor.querySelector('#memory-select');
    const remove = editor.querySelector('#memory-remove');
    const status = editor.querySelector('#memory-status');
    let source;
    review.hidden = remove.hidden = true;
    form.onsubmit = async event => {
      event.preventDefault();
      const link = form.elements.link.value.trim();
      form.querySelector('button').disabled = true;
      review.hidden = true;
      status.textContent = 'Hämtar ditt inlägg …';
      try {
        const response = await fetch('/data/memory-source',{method:'POST',body:new URLSearchParams({csrf,link})});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        source = {channel:channels[data.channel],date:data.date};
        editor.querySelector('#memory-original').textContent = data.text || 'Inlägg utan text';
        editor.querySelector('#memory-link').href = link;
        select.reset();
        review.hidden = false;
        status.textContent = '';
      } catch(error) { status.textContent = error.message || 'Kunde inte läsa ditt inlägg.'; }
      finally { form.querySelector('button').disabled = false; }
    };
    select.onsubmit = event => {
      event.preventDefault();
      const title = select.elements.title.value.trim();
      if (!title) return;
      stats.memory = {...source,title};
      render(3*frames/6+fps);
      remove.hidden = false;
      status.textContent = 'Ditt minne är med i förhandsvisningen och videon.';
    };
    remove.onclick = () => {
      delete stats.memory;
      render();
      remove.hidden = true;
      status.textContent = 'Minnet är borttaget ur filmen.';
    };
  }
  render();
  const video = document.querySelector('#year-video');
  const status = document.querySelector('#video-status');
  video.hidden = false;
  video.onclick = () => {
    video.disabled = true;
    status.textContent = 'Skapar video …';
    let worker;
    function finish(message) {
      status.textContent = message;
      video.disabled = false;
      worker?.terminate();
    }
    try {
      worker = new Worker('/static/year-export.js');
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
  download.onclick = () => {
    const canvas = document.createElement('canvas');
    canvas.width=1080; canvas.height=1350;
    paintPoster(canvas,stats,239);
    const link = document.createElement('a');
    link.download='mitt-opensverige-2026.png';
    link.href=canvas.toDataURL('image/png');
    link.click();
  };
};
