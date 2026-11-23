export const fps = 20;
export const secondsPerScene = 10;
export const soundtrack = '/static/year-music.m4a';
export const theme = {
  moss: '#284b37', mint: '#cbefac', paper: '#fcf7e9', rust: '#a43e25',
  ink: '#20291e', gold: '#f5bf66', font: '"Segoe UI", sans-serif'
};
const number = n => (n ?? 0).toLocaleString('sv-SE');
// Edit the order, copy and palette here. Values come from the completed scan.
export const scenes = [
  {colors:['moss','paper','mint'], title:'Mitt år i', value:()=>'OpenSverige', detail:s=>s.name},
  {colors:['mint','ink','rust'], title:'Jag var med', value:s=>number(s.days), detail:()=>'aktiva dagar i chatten'},
  {colors:['rust','paper','gold'], title:'Min hemmaplan', value:s=>s.channels || 'OpenSverige', detail:s=>number(s.count)+' egna inlägg här'},
  {colors:['paper','moss','rust'], title:s=>s.memory?'Mitt minne från året':'Respons på mina inlägg', value:s=>s.memory?.title || number(s.reactions), detail:s=>s.memory?'#'+s.memory.channel+'   /   '+s.memory.date:'kvarvarande reaktioner'},
  {colors:['ink','mint','gold'], title:s=>s.emoji?'Min signatur':'Mina inlägg', value:s=>s.emoji || number(s.messages), detail:s=>s.emoji?number(s.uses)+' gånger i mina inlägg':'inlägg under året'},
  {colors:['moss','paper','gold'], title:'Mitt OpenSverige', value:s=>s.name, detail:s=>number(s.messages)+' inlägg   /   '+number(s.days)+' aktiva dagar'}
];
export const frames = scenes.length * secondsPerScene * fps;
