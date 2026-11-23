import {Input, Output, BufferSource, BufferTarget, MP4, Mp4OutputFormat,
  EncodedPacketSink, EncodedVideoPacketSource, EncodedAudioPacketSource} from 'mediabunny';
import {soundtrack} from './design';

export async function addMusic(videoBytes) {
  const response = await fetch(soundtrack);
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
    async function copy(track, dest) {
      const decoderConfig = await track.getDecoderConfig();
      for await (const packet of new EncodedPacketSink(track).packets()) {
        if(packet.timestamp >= 0) await dest.add(packet,{decoderConfig});
      }
      dest.close();
    }
    await Promise.all([copy(await video.getPrimaryVideoTrack(),picture),
      copy(await audio.getPrimaryAudioTrack(),music)]);
    await output.finalize();
    return new Blob([output.target.buffer], {type:'video/mp4'});
  } finally {
    video.dispose();
    audio.dispose();
  }
}
