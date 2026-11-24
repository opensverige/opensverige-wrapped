import {Input, Output, BufferSource, BufferTarget, MP4, Mp4OutputFormat,
  EncodedPacketSink, EncodedVideoPacketSource, EncodedAudioPacketSource} from 'mediabunny';
import {fps,musicSections,originalTrack} from './design';

export async function addMusic(videoBytes, duration, track=originalTrack) {
  if(!track) return new Blob([videoBytes],{type:'video/mp4'});
  const response = await fetch(track.src);
  if (!response.ok) throw new Error('Soundtrack unavailable');
  const open = bytes => new Input({source:new BufferSource(bytes),formats:[MP4]});
  const video = open(videoBytes);
  const audio = open(await response.arrayBuffer());
  try {
    const output = new Output({format:new Mp4OutputFormat(),target:new BufferTarget()});
    const picture = new EncodedVideoPacketSource('avc');
    const music = new EncodedAudioPacketSource('aac');
    output.addVideoTrack(picture);
    output.addAudioTrack(music);
    await output.start();
    async function copy(track, dest, sections) {
      const decoderConfig = await track.getDecoderConfig();
      for (const section of sections) {
        const from=section.from/fps, end=from+section.frames/fps, offset=section.start/fps-from;
        for await (const packet of new EncodedPacketSink(track).packets()) {
          if (packet.timestamp >= end) break;
          if (packet.timestamp < from) continue;
          const adjusted=offset ? packet.clone({timestamp:packet.timestamp+offset}) : packet;
          await dest.add(adjusted,{decoderConfig});
        }
      }
      dest.close();
    }
    await Promise.all([copy(await video.getPrimaryVideoTrack(),picture,[{from:0,start:0,frames:Infinity}]),
      copy(await audio.getPrimaryAudioTrack(),music,musicSections(Math.round(duration*fps),track.frames))]);
    await output.finalize();
    return new Blob([output.target.buffer], {type:'video/mp4'});
  } finally {
    video.dispose();
    audio.dispose();
  }
}
