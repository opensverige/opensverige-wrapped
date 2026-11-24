const catalog=JSON.parse(document.getElementById('catalog').textContent);
const form=document.getElementById('theme-form');
const input=name=>form.elements.namedItem(name);
const audio=document.getElementById('listen');
const colors=['green','lime','rust','paper'];
function updatePreview(){
  const track=catalog.tracks.find(t=>t.id===input('track').value) || null;
  if(track && audio.getAttribute('src')!==track.src) audio.src=track.src;
  if(!track){audio.pause();audio.removeAttribute('src');}
  audio.hidden=!track;
  const theme={id:input('theme').value,name:input('name').value,layout:input('layout').value,track,
    colors:Object.fromEntries(colors.map(k=>[k,input(k).value]))};
  window.previewTheme(document.getElementById('theme-preview'),theme);
}
function selectTheme(){
  const theme=catalog.themes.find(t=>t.id===input('theme').value);
  input('name').value=theme.name;
  input('layout').value=theme.layout;
  input('track').value=theme.track?.id || '';
  input('revision').value=theme.revision;
  for(const key of colors) input(key).value=theme.colors[key];
  updatePreview();
}
const selected=new URLSearchParams(location.search).get('theme');
if(catalog.themes.some(t=>t.id===selected))input('theme').value=selected;
selectTheme();
form.addEventListener('input',event=>{
  if(event.target.name==='theme')selectTheme();
  else updatePreview();
});
document.getElementById('upload').onsubmit=async event=>{
  event.preventDefault();
  const upload=event.currentTarget, status=document.getElementById('upload-status'), button=upload.querySelector('button');
  const data=new FormData(upload);
  if(data.get('audio').size>4000000){status.textContent='Ljudfilen får vara högst 4 MB.';return;}
  data.set('csrf',catalog.csrf);
  button.disabled=true;status.textContent='Läser in ljudspåret …';
  try{
    const result=await fetch('/admin/music',{method:'POST',body:data});
    if(result.redirected)throw new Error('Logga in igen för att lägga till musik.');
    if(!result.ok)throw new Error(result.status===422?'Välj en läsbar MP3 mellan 2 sekunder och 3 minuter.':'Ljudfilen kunde inte sparas.');
    const track=await result.json();
    catalog.tracks.push(track);
    input('track').add(new Option(track.name,track.id,true,true));
    updatePreview();upload.reset();status.textContent='Spåret är valt. Spara temat för att använda det.';
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
};
