function mergeEventGroups(groups){
  function signature(e){
    const text=norm((e.viewTitle||'')+' '+(e.viewText||''));
    const time=Date.parse(e.publishedAt);
    const places=[
      'cakmak','dudullu','ihlamurkuyu','tepeustu','elmalikent',
      'inkilap','parseller','yamanevler','armaganevler','tavukcuyolu'
    ].filter(p=>new RegExp('\\b'+p+'\\b').test(text));
    const casualties=text.match(/\b(\d+)\s+isci\s+yaral/);
    const dates=text.match(
      /\b\d{1,2}\s+(?:ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)(?:\s+20\d{2})?\b/g
    )||[];
    return {
      time,
      day:Number.isFinite(time)
        ?new Date(time+10800000).toISOString().slice(0,10):'',
      kind:incidentKind(text),
      site:placeAnchor(text),
      industrial:/\bsanayi\s+site\w*/.test(text),
      places,
      casualties:casualties?.[1]||'',
      dates
    };
  }
  function compatible(a,b){
    if(!a.day||a.day!==b.day)return false;
    if(Math.abs(a.time-b.time)>12*3600000)return false;
    if(a.kind!=='balkon-cokme'||b.kind!==a.kind)return false;
    if(!a.industrial||!b.industrial)return false;
    if(a.site&&b.site&&a.site!==b.site)return false;
    if(a.places.length&&b.places.length&&
       !a.places.some(p=>b.places.includes(p)))return false;
    if(a.casualties&&b.casualties&&a.casualties!==b.casualties)
      return false;
    if(a.dates.length&&b.dates.length&&
       !a.dates.some(d=>b.dates.includes(d)))return false;
    return true;
  }

  const all=groups.flatMap(g=>g.items);
  const targeted=e=>{
    const s=signature(e);
    return s.kind==='balkon-cokme'&&s.industrial;
  };
  const selected=all.filter(targeted);
  const others=groupItems(all.filter(e=>!targeted(e)));
  const anchors=[];
  const unnamed=[];
  for(const e of selected){
    const s=signature(e);
    if(!s.site){unnamed.push(e);continue;}
    const matches=anchors.filter(g=>g.items.every(x=>{
      const t=signature(x);
      return s.site===t.site&&compatible(s,t);
    }));
    if(matches.length===1)matches[0].items.push(e);
    else anchors.push({items:[e]});
  }
  const proposals=unnamed.map(e=>({
    e,
    matches:anchors.filter(g=>g.items.every(x=>
      compatible(signature(e),signature(x))))
  }));
  const separate=[];
  for(const {e,matches} of proposals){
    if(matches.length===1&&matches[0].items.every(x=>
       compatible(signature(e),signature(x)))){
      matches[0].items.push(e);
    }else separate.push({items:[e]});
  }
  return [...others,...anchors,...separate];
}
