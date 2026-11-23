import React, {useLayoutEffect, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '@remotion/player';
import {useCurrentFrame} from 'remotion';

import {paint} from './paint';
function YearCard({stats}) {
  const ref = useRef(null);
  const frame = useCurrentFrame();
  useLayoutEffect(() => paint(ref.current,stats,frame),[stats,frame]);
  return <canvas ref={ref} width={1080} height={1350} style={{width:'100%',height:'100%'}}/>;
}
window.showYear = stats => {
  const host = document.querySelector('#year-preview');
  const root = createRoot(host);
  root.render(<Player component={YearCard} inputProps={{stats}} durationInFrames={240}
    compositionWidth={1080} compositionHeight={1350} fps={30} controls autoPlay
    style={{width:'100%',maxWidth:440,aspectRatio:'4/5'}}/>);
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
    paint(canvas,stats,239);
    const link = document.createElement('a');
    link.download='mitt-opensverige-2026.png';
    link.href=canvas.toDataURL('image/png');
    link.click();
  };
};
