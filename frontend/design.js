export const fps = 20;
export const soundtrack = '/static/midnight-circuit-v1.m4a';
const soundtrackFrames = 120 * fps;
export function musicSections(frames) {
  const end = soundtrackFrames;
  const coda=Math.min(7*fps,Math.floor(end/3)), body=end-coda;
  if(frames===end) return [{start:0,from:0,frames}];
  const tail=Math.min(coda,frames), first=Math.min(body,frames-tail);
  const sections=first ? [{start:0,from:0,frames:first}] : [];
  let start=first;
  while(frames-start>end) {
    sections.push({start,from:0,frames:body});
    start+=body;
  }
  const remaining=frames-start;
  sections.push({start,from:end-remaining,frames:remaining});
  return sections;
}
const labels = {
  project:'Från verkstaden', detour:'Årets sidospår', quote:'Årets replik',
  help:'En hjälpande hand', milestone:'Ett ögonblick att minnas', change:'När året tog en vändning',
  humor:'Årets glimt i ögat'
};
const number = n => Number(n || 0).toLocaleString('sv-SE');
export function buildScenes(stats) {
  const scenes = [];
  const add = (title,value,detail='',source='',kind='stat') => scenes.push({title,value,detail,source,kind});
  add('Ett år i OpenSverige',stats.name,'Wrapped 2026');
  const stories = stats.stories || [];
  const ordered = stories.slice(0,12).sort((a,b)=>(a.date || '').localeCompare(b.date || ''));
  for (const item of ordered) {
    const channel=item.channel?.replace(/^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_-]+$/gu,'');
    add(labels[item.kind] || 'Ur året',item.kind==='quote'?'”'+item.story+'”':item.title,
      item.kind==='quote'?'':item.story,[item.date,channel && '#'+channel].filter(Boolean).join('   /   '),item.kind);
    scenes.at(-1).storyIndex=stories.indexOf(item);
  }
  const facts = [];
  function fact(score,...scene) { facts.push({score,scene}); }
  if(stats.messages>0) fact(6,'Året i inlägg',number(stats.messages)+' inlägg',number(stats.days)+' aktiva dagar i OpenSverige.');
  if(stats.activity?.longestStreak>=4) fact(3,'Längsta sviten',number(stats.activity.longestStreak)+' dagar','Med minst ett inlägg varje dag.');
  if(stats.voice?.streamSeconds>=60) fact(3,'Skärmen delades',number(Math.floor(stats.voice.streamSeconds/60))+' minuter','Registrerad skärmdelning sedan 23 november 2026.');
  if(stats.activity?.replies>=3) fact(2,'Samtalen fortsatte',number(stats.activity.replies)+' direkta svar','');
  if (stats.voice?.minutes>=1) fact(stats.messages ? 1 : 5,'I röstchatten',
    number(stats.voice.minutes)+' minuter','Registrerad rösttid sedan 23 november 2026');
  if (stats.laugh?.count>=2 && !stories.some(s=>s.kind==='humor'))
    fact(4,'Inlägget som fick folk att skratta',number(stats.laugh.count)+' skrattreaktioner',
      'I #'+stats.laugh.channel,stats.laugh.date);
  if (stats.peak?.count>=3 && stats.days>1 && stats.peak.count>=2*stats.messages/stats.days)
    fact(3,'Årets intensivaste dag',number(stats.peak.count)+' inlägg','',stats.peak.date);
  if (stats.count>0) fact(2,'Hemmaplan',stats.channels,number(stats.count)+(stats.channels.includes(' / ')?' egna inlägg per kanal':' egna inlägg här'));
  if (stats.uses>1) fact(1,'Årets signatur',stats.emoji,number(stats.uses)+' gånger i inläggen');
  if (stats.reactions>0) fact(0,'Reaktioner i chatten',number(stats.reactions),'Kvarvarande reaktioner');
  const selectedFacts = facts.sort((a,b)=>b.score-a.score).slice(0,8);
  for (const [index,{scene}] of selectedFacts.entries()) {
    const [title,value,detail,source,kind='stat'] = scene;
    const position = 1 + Math.round((index+1)*ordered.length/(selectedFacts.length+1)) + index;
    scenes.splice(position,0,{title,value,detail,source:source || '',kind});
  }
  add('OpenSverige 2026',stats.name,stats.messages ?
    number(stats.messages)+' inlägg under '+number(stats.days)+' aktiva dagar' :
    'Inga egna inlägg i årets lästa kanalchattar');
  let start=0;
  const timed=scenes.map((scene,index)=>{
    const bookend=index===0 || index===scenes.length-1;
    const words=(scene.value+' '+scene.detail).trim().split(/\s+/).length;
    const seconds=bookend?3.8:Math.max(scene.kind==='stat'?3.4:4.2,Math.min(12,1.1+words/3.1));
    const entry={...scene,start,frames:Math.round(seconds*fps)};
    start+=entry.frames;
    return entry;
  });
  const minLength=ordered.length>=8 ? 120*fps : 0;
  const scale=Math.min(180*fps/start,Math.max(1,minLength/start));
  for(const scene of timed) {
    const end=Math.round((scene.start+scene.frames)*scale);
    scene.start=Math.round(scene.start*scale);
    scene.frames=end-scene.start;
  }
  return timed;
}
export const totalFrames=scenes=>scenes.at(-1).start+scenes.at(-1).frames;
