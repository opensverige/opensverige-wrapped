const runsList = document.querySelector('#wrapped-runs');
const storyStatus = document.querySelector('#story-status');
let currentYearStats;
function filmInput(run) {
  const stats = {...run.stats};
  stats.stories = run.stories.map(({kind,title,story,sources}) => {
    const source=kind==='change' ? [...sources].sort((a,b)=>b.date.localeCompare(a.date))[0] : sources[0];
    return {kind,title,story,date:source?.date,channel:channels[source?.channel]};
  });
  return stats;
}
function displayVersion(run) {
  if (document.querySelector('#year-preview')) {
    window.showYear({...filmInput(run), runId:run.id});
    yearProgress.textContent='Manuset är klart.';
  }
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
    const input=document.createElement('details'), label=document.createElement('summary'), json=document.createElement('pre');
    label.textContent='Visa filmens input (JSON)';
    json.className='wrapped-input';
    input.ontoggle=()=>{ if(input.open) json.textContent=JSON.stringify(filmInput(run),null,2); };
    input.append(label,json);
    details.append(input);
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
      preview.textContent='Läs manuset för den här versionen';
      preview.onclick=()=>displayVersion(run);
      details.append(document.createElement('p'),preview);
    }
    details.open=run.id===selected;
    if(details.open) displayVersion(run);
    runsList.append(details);
  }
}
let generationId;
let analysisAfter='0', analysing=false;
async function generateStories(stats, resume=false) {
  if (analysing) return;
  currentYearStats=stats;
  if (!resume) {
    generationId=crypto.randomUUID();
    analysisAfter='0';
  }
  analysing=true;
  button.disabled=true;
  const retry=document.querySelector('#retry-story');
  retry.hidden=true;
  try {
    storyStatus.textContent='Letar efter berättelser i dina sparade inlägg …';
    yearProgress.textContent='Underlaget är klart. Letar efter berättelser i årets inlägg …';
    for (;;) {
      const response=await fetch('/data/wrappers',{method:'POST',body:new URLSearchParams({
        csrf,run:generationId,after:analysisAfter,stats:JSON.stringify(stats)
      })});
      const step=await response.json();
      if(!response.ok) throw new Error(step.error || 'Analysen avbröts.');
      analysisAfter=step.after;
      storyStatus.textContent=step.count+' inlägg genomgångna.';
      yearProgress.textContent=storyStatus.textContent+' Förbereder ditt granskade manus …';
      if(step.done) break;
    }
    await loadRuns(generationId);
    storyStatus.textContent='Din Wrapped är sparad.';
  } catch(error) {
    yearProgress.textContent=error.message;
    storyStatus.textContent=error.message;
    retry.hidden=false;
    retry.onclick=()=>generateStories(currentYearStats,true);
  } finally {analysing=false;button.disabled=false;}
}
loadRuns().catch(error=>{runsList.textContent=error.message;});
