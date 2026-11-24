import {loadImages,paint as paintFrame} from './paint';
import {buildScenes,fps} from './design';

export async function paint(canvas,stats) {
  const scenes=buildScenes(stats);
  const selected=stats.stories?.length ? 1 : 0;
  paintFrame(canvas,stats,scenes[selected].start+3*fps,scenes,await loadImages(stats));
}
