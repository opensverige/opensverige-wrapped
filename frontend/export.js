importScripts('/static/year-codec.js');
import {loadImages,paint} from './paint';

import {addMusic} from './music';
import {fps,totalFrames,buildScenes} from './design';

self.onmessage = async ({data: stats}) => {
  let encoder;
  try {
    const scenes = buildScenes(stats);
    const frames = totalFrames(scenes);
    const image = await loadImages(stats);
    const canvas = new OffscreenCanvas(1080,1350);
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    encoder = await self.HME.createH264MP4Encoder();
    encoder.width = canvas.width;
    encoder.height = canvas.height;
    encoder.frameRate = fps;
    encoder.initialize();
    for (let frame=0; frame<frames; frame++) {
      paint(canvas,stats,frame,scenes,image);
      const pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
      encoder.addFrameRgba(pixels);
      if (frame % 12 === 0) self.postMessage({percent:Math.round(frame/frames*100)});
    }
    encoder.finalize();
    const file = await addMusic(encoder.FS.readFile(encoder.outputFilename),frames/fps,stats.format);
    self.postMessage({file});
  } catch {
    self.postMessage({error:true});
  } finally {
    encoder?.delete();
  }
};
