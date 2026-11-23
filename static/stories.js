const runsList = document.querySelector('#wrapped-runs');
const storyStatus = document.querySelector('#story-status');
let currentYearStats;
function displayVersion(run) {
  const stats = {...run.stats};
  const first = run.stories[0];
  if (first) {
    const source = first.sources[0];
    stats.memory = {title:first.title,channel:channels[source.channel],date:source.date};
  }
  if (document.querySelector('#year-preview')) window.showYear(stats);
}
async function loadRuns(selected) {
  const response = await fetch('/data/wrappers');
  if (!response.ok) throw new Error('Historiken kunde inte läsas.');
  const {runs} = await response.json();
  runsList.replaceChildren();
  if (!runs.length) runsList.textContent = 'Inga sparade versioner ännu.';
  for (const [index,run] of runs.entries()) {
    const details=document.createElement('details');
    const summary=document.createElement('summary');
    summary.textContent='Version '+(runs.length-index)+' · '+new Date(run.time).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'})+' · '+run.count+' inlägg';
    details.append(summary);
    if (!run.stories.length) details.append('Underlaget gav inga säkra berättelser.');
    for (const story of run.stories) {
      const title=document.createElement('h3'), body=document.createElement('p');
      title.textContent=story.title;
      body.textContent=story.story;
      details.append(title,body);
      for (const source of story.sources) {
        const link=document.createElement('a');
        link.textContent='#'+channels[source.channel]+' · '+source.date;
        link.href='https://discord.com/channels/1466847548864987289/'+source.channel+'/'+source.id;
        link.target='_blank';link.rel='noopener noreferrer';
        details.append(link,' ');
      }
    }
    if (document.querySelector('#year-preview')) {
      const preview=document.createElement('button');
      preview.textContent='Visa den här versionen i spelaren';
      preview.onclick=()=>displayVersion(run);
      details.append(document.createElement('p'),preview);
    }
    details.open=run.id===selected;
    if(details.open) displayVersion(run);
    runsList.append(details);
  }
}
const generationId=crypto.randomUUID();
let analysisAfter='0', analysing=false;
async function generateStories(stats) {
  currentYearStats=stats;
  if (analysing) return;
  analysing=true;
  const retry=document.querySelector('#retry-story');
  retry.hidden=true;
  try {
    storyStatus.textContent='Letar efter berättelser i dina sparade inlägg …';
    for (;;) {
      const response=await fetch('/data/wrappers',{method:'POST',body:new URLSearchParams({
        csrf,run:generationId,after:analysisAfter,stats:JSON.stringify(stats)
      })});
      const step=await response.json();
      if(!response.ok) throw new Error(step.error || 'Analysen avbröts.');
      analysisAfter=step.after;
      storyStatus.textContent=step.count+' inlägg genomgångna.';
      if(step.done) break;
    }
    await loadRuns(generationId);
    storyStatus.textContent='Din Wrapped är sparad.';
  } catch(error) {
    storyStatus.textContent=error.message;
    retry.hidden=false;
    retry.onclick=()=>generateStories(currentYearStats);
  } finally {analysing=false;}
}
loadRuns().catch(error=>{runsList.textContent=error.message;});
