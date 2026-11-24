function filmInput(run, channels) {
  const stats = {...run.stats};
  stats.stories = run.stories.map(({kind,title,story,sources}) => {
    const source=kind==='change' ? [...sources].sort((a,b)=>b.date.localeCompare(a.date))[0] : sources[0];
    return {kind,title,story,date:source?.date,channel:channels[source?.channel]};
  });
  return stats;
}
