export const hand='/static/wrapped-hand.png';
export const avatarClip='url(#wrapped-avatar-circle)';

export function profileAvatar(elements,stats,x,y,size,ink,paper) {
  const initial=Array.from((stats.name || '').trim())[0] || '•';
  elements.push(
    {tag:'rect',props:{x,y,width:size,height:size,rx:size/2,fill:ink}},
    {tag:'text',value:initial.toLocaleUpperCase('sv-SE'),props:{
      x:x+size/2,y:y+size*.68,fontSize:size*.51,fontFamily:'Arial, sans-serif',
      fontStyle:'normal',fontWeight:700,fill:paper,opacity:1,textAnchor:'middle'
    }}
  );
  if(stats.avatar)elements.push({tag:'image',props:{
    href:stats.avatar,x:x+2,y:y+2,width:size-4,height:size-4,clipPath:avatarClip
  }});
}
