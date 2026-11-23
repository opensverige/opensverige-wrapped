importScripts('/static/year-codec.js');
import {paint} from './paint';

self.onmessage = async ({data: stats}) => {
  let encoder;
  try {
    const canvas = new OffscreenCanvas(1080,1350);
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    encoder = await self.HME.createH264MP4Encoder();
    encoder.width = canvas.width;
    encoder.height = canvas.height;
    encoder.frameRate = 30;
    encoder.initialize();
    let pixels;
    for (let frame=0; frame<240; frame++) {
      if (frame <= 70) {
        paint(canvas,stats,frame);
        pixels = ctx.getImageData(0,0,canvas.width,canvas.height).data;
      }
      encoder.addFrameRgba(pixels);
      if (frame % 12 === 0) self.postMessage({percent:Math.round(frame/240*100)});
    }
    encoder.finalize();
    const file = new Blob([encoder.FS.readFile(encoder.outputFilename)],{type:'video/mp4'});
    self.postMessage({file});
  } catch {
    self.postMessage({error:true});
  } finally {
    encoder?.delete();
  }
};
