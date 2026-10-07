'use strict';
document.documentElement.classList.add('js');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// Navigation stays usable without depending on animation or scroll position.
const menu = $('.menu-button');
const nav = $('#navigation');
function closeMenu() {
  nav.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
}
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('open', open);
});
nav.addEventListener('click', (event) => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && nav.classList.contains('open')) { closeMenu(); menu.focus(); }
});

// Fixed orthographic projections. All dimensions here are illustrative units, not construction measures.
const pts = (points) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const poly = (points, fill, stroke = '#5d6264', extra = '') => `<polygon points="${pts(points)}" fill="${fill}" stroke="${stroke}" stroke-width=".8" stroke-linejoin="round" ${extra}/>`;
const line = (a, b, stroke, width = 1, extra = '') => `<path d="M${a.join(',')}L${b.join(',')}" fill="none" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
const rp = (u, v, h = 0) => [121 + u + .58 * v - .10 * h, 425 + .28 * u - .70 * v - h];
function rbox(u, v, w, d, h, thick, top, front, side) {
  const p = [rp(u,v,h),rp(u+w,v,h),rp(u+w,v+d,h),rp(u,v+d,h)];
  return poly([p[0],p[1],rp(u+w,v,h-thick),rp(u,v,h-thick)],front) + poly([p[1],p[2],rp(u+w,v+d,h-thick),rp(u+w,v,h-thick)],side) + poly(p,top);
}
const roofData = {
  pitched: {
    title:'Steildach, schematischer Beispielaufbau',
    desc:'Explosionszeichnung einer Ziegeldeckung über querliegenden Dachlatten, Konterlatten in Gefällerichtung, einer Unterdeckbahn und tragenden Sparren. Dämmung und Luftdichtheit sind nicht dargestellt.',
    layers:[['Ziegeldeckung','Die äußere Deckung führt Niederschlag ab.'],['Traglattung','Quer zum Gefälle. Sie trägt die Dachziegel.'],['Konterlattung','In Gefällerichtung über den Sparren.'],['Unterdeckbahn','Zusätzliche wasserführende Ebene im Beispiel.'],['Sparren','Tragende Holzkonstruktion in Gefällerichtung.']],
    note:'Vereinfachtes Steildachbeispiel. Dämmung, Luftdichtheit und Anschlussdetails sind hier nicht dargestellt. Weitere Schichten hängen vom Dachsystem ab.',
    heights:[205,148,99,54,0], assembled:[36,31,18,3,0]
  },
  flat: {
    title:'Warmflachdach auf Massivdecke, schematischer Beispielaufbau',
    desc:'Abdichtung über Wärmedämmung, Dampfsperre und einer tragenden Massivdecke. Ein Warmdach-Prinzip, kein Umkehrdach.',
    layers:[['Abdichtung','Die wasserführende Ebene über der Dämmung.'],['Wärmedämmung','Die Dämmschicht im Warmdach.'],['Dampfsperre','Unterhalb der Dämmung im dargestellten Beispiel.'],['Tragdecke','Tragende Massivdecke als Beispiel.']],
    note:'Vereinfachtes Warmdach auf Massivdecke. Gefälle, Befestigung, zusätzliche Lagen und Anschlüsse sind nicht dargestellt. Kein Umkehrdach.',
    heights:[190,127,65,0], assembled:[54,49,3,0]
  }
};
let roofType = 'pitched';
let roofOpen = true;
let selectedLayer = null;
function roofDefs() {
  return `<defs><pattern id="wood-grain" patternUnits="userSpaceOnUse" width="35" height="21" patternTransform="rotate(16)"><rect width="35" height="21" fill="#ad8d68"/><path d="M0 4h35M0 8h35M0 15h35M0 19h35" stroke="#826443" stroke-width=".55" opacity=".5"/></pattern><pattern id="insulation" patternUnits="userSpaceOnUse" width="12" height="12"><rect width="12" height="12" fill="#b8ac8e"/><path d="m0 8 8-8m-4 16L16 4" stroke="#837b66" stroke-width=".6" opacity=".7"/></pattern><pattern id="concrete" patternUnits="userSpaceOnUse" width="19" height="19"><rect width="19" height="19" fill="#b9b9b0"/><circle cx="3" cy="4" r=".7" fill="#898d88"/><circle cx="14" cy="12" r=".8" fill="#898d88"/><path d="m7 14 2-2" stroke="#898d88" stroke-width=".6"/></pattern></defs>`;
}
function pitchedLayer(index) {
  let out = '';
  const h = roofData.pitched.assembled[index];
  if (index === 4) {
    for (const u of [42,157,272]) out += rbox(u,0,27,237,h,35,'url(#wood-grain)','#8f704f','#795f43');
  } else if (index === 3) {
    out += rbox(0,0,360,230,h,3,'#747e80','#505b5e','#596467');
    for(const v of [70,145]) out += line(rp(0,v,h+1),rp(360,v,h+1),'#b0b8b5',.9);
  } else if (index === 2) {
    for(const u of [42,157,272]) out += rbox(u,0,27,235,h,14,'url(#wood-grain)','#8b6f51','#7b6146');
  } else if (index === 1) {
    for(const v of [9,58,107,156,205]) out += rbox(-4,v,369,17,h,13,'url(#wood-grain)','#957b5b','#765c43');
  } else {
    // Overlapping rows are drawn from ridge to eave; no fixing detail or tile profile is claimed.
    for(let row=4;row>=0;row--) for(let col=0;col<8;col++) {
      const u=col*45, v=row*46;
      out += rbox(u,v,44,49,h,5,col%3===0?'#4c5357':'#41494d','#30393e','#363e43');
      out += line(rp(u+7,v+2,h+.5),rp(u+7,v+45,h+.5),'#8d9491',.65);
      out += line(rp(u+36,v+3,h+.5),rp(u+36,v+45,h+.5),'#242e33',.75);
    }
  }
  return out;
}
function flatLayer(index) {
  // Same projection, but with level plan axes: a distinct warm-roof example, not a pitched-roof relabel.
  const fp=(u,v,h=0)=>[127+u+.74*v,422+.31*u-.48*v-h];
  function box(h,t,top,front,side) {
    const p=[fp(0,0,h),fp(360,0,h),fp(360,215,h),fp(0,215,h)];
    return poly([p[0],p[1],fp(360,0,h-t),fp(0,0,h-t)],front)+poly([p[1],p[2],fp(360,215,h-t),fp(360,0,h-t)],side)+poly(p,top);
  }
  const h=roofData.flat.assembled[index];
  if(index===3) return box(h,36,'url(#concrete)','#a3a6a0','#8d938e');
  if(index===2) return box(h,3,'#747a78','#585e5c','#4b5251');
  if(index===1) {
    let out=box(h,46,'url(#insulation)','#9d937b','#8f876f');
    for(const u of [90,180,270]) out+=line(fp(u,0,h+.6),fp(u,215,h+.6),'#7a7663',.7);
    out+=line(fp(0,108,h+.6),fp(360,108,h+.6),'#7a7663',.7);
    return out;
  }
  let out=box(h,5,'#535b5d','#3c474b','#374348');
  for(const v of [71,142])out+=line(fp(0,v,h+1),fp(360,v,h+1),'#87908e',1);
  return out;
}
function drawRoof() {
  const data=roofData[roofType];
  let markup=`<title id="roof-svg-title">${data.title}</title><desc id="roof-svg-desc">${data.desc}</desc>${roofDefs()}`;
  markup+=`<g opacity=".35"><path class="grid-line" d="M90 495 445 594M90 495 635 168M124 505 669 178M225 533 770 206"/><path d="M103 479v34m-17-17h34M686 341v20m-10-10h20" stroke="#8f938b" stroke-width=".7"/></g>`;
  for(let i=data.layers.length-1;i>=0;i--) markup+=`<g class="diagram-layer" data-layer="${i}">${roofType==='pitched'?pitchedLayer(i):flatLayer(i)}</g>`;
  $('#roof-svg').innerHTML=markup;
  $('#roof-legend').innerHTML=data.layers.map(([name,desc],i)=>`<button class="layer-item" type="button" data-layer-select="${i}" aria-pressed="false"><span class="layer-number">0${i+1}</span><span><strong>${name}</strong><small>${desc}</small></span></button>`).join('');
  $('#roof-note').textContent=data.note;
  selectedLayer=null;
  updateRoof();
}
function updateRoof() {
  const data=roofData[roofType];
  $$('#roof-svg .diagram-layer').forEach((group)=> {
    const i=Number(group.dataset.layer);
    const delta=roofOpen?data.heights[i]-data.assembled[i]:0;
    group.style.transform=`translate(${-delta*.10}px,${-delta}px)`;
    group.classList.toggle('dimmed',selectedLayer!==null&&selectedLayer!==i);
  });
  $$('[data-layer-select]').forEach(button=>{
    const active=Number(button.dataset.layerSelect)===selectedLayer;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  $('#roof-explode').setAttribute('aria-pressed',String(roofOpen));
  $('#roof-explode span').textContent=roofOpen?'Aufbau schließen':'Aufbau öffnen';
  $('#roof-state').textContent=roofOpen?'Explosionsansicht · Bauteile zur Ansicht getrennt':'Zusammengesetzt · Schematischer Beispielaufbau';
}
$$('[data-roof]').forEach(button=>button.addEventListener('click',()=>{
  roofType=button.dataset.roof;
  $$('[data-roof]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  drawRoof();
}));
$('#roof-explode').addEventListener('click',()=>{roofOpen=!roofOpen;updateRoof();});
$('#roof-legend').addEventListener('click',event=>{
  const button=event.target.closest('[data-layer-select]');
  if(!button)return;
  const index=Number(button.dataset.layerSelect);
  selectedLayer=selectedLayer===index?null:index;
  updateRoof();
});
$('#roof-all').addEventListener('click',()=>{selectedLayer=null;updateRoof();});
drawRoof();

// PV: one generic framed module and two support rails. No model-specific clamp zone is certified.
const pp=(u,v,h=0)=>[95+u+.55*v-.13*h,364+.25*u-.66*v-h];
function pvBox(u,v,w,d,h,t,top,front,side) {
  const p=[pp(u,v,h),pp(u+w,v,h),pp(u+w,v+d,h),pp(u,v+d,h)];
  return poly([p[0],p[1],pp(u+w,v,h-t),pp(u,v,h-t)],front,'#bac0bb')+poly([p[1],p[2],pp(u+w,v+d,h-t),pp(u+w,v,h-t)],side,'#bac0bb')+poly(p,top,'#bac0bb');
}
function drawPV() {
  let out=`<title id="pv-title">Aufdach-Solarmontage, abstrahierte mechanische Prinzipdarstellung</title><desc id="pv-desc">Ein gerahmtes Solarmodul liegt auf zwei Aluminium-Tragschienen. Endklemmen greifen nur den Rahmen. Dachhaken sind an der tragenden Konstruktion befestigt und werden nicht auf den Ziegeln abgestützt. Explodierte Bauteile liegen zur Erklärung auseinander. Ein separater montierter Querschnitt zeigt Rahmen, Klemme, Schiene, Dachhaken, Ziegel mit freier Durchführung und tragendes Holz. Keine Maße oder freigegebene System-Modul-Kombination.</desc><defs><pattern id="pv-cells" width="33" height="30" patternUnits="userSpaceOnUse" patternTransform="matrix(1 .25 .55 -.66 95 364)"><rect width="33" height="30" fill="#202e38"/><path d="M0 0h33v30H0zM11 0v30M22 0v30" stroke="#a1adb0" stroke-width=".38" opacity=".75"/></pattern></defs>`;
  // Roof: tiles above cross battens and longitudinal structural timber, shown at one fixed separation.
  for(const u of [28,160,290]) out+=pvBox(u,0,23,229,-16,24,'#ac8964','#8c6b4b','#775b41');
  for(const v of [18,90,162])out+=pvBox(0,v,330,10,-2,9,'#ac8964','#8c6b4b','#775b41');
  for(let row=3;row>=0;row--)for(let col=0;col<7;col++){
    const u=col*47,v=row*55;
    // Windows at hook exits are intentionally omitted from the cover, never a solid-tile penetration.
    if((col===0||col===3||col===6)&&(row===1||row===2))continue;
    out+=pvBox(u,v,46,54,9,3,'#687075','#4a555b','#48525a');
  }
  // Hook symbols remain anchored in the base timber; uplifted parts above are explicitly exploded.
  for(const u of [38,170,300])for(const v of [68,145]){
    const a=pp(u,v,-12),b=pp(u,v,5),c=pp(u,v+15,10),d=pp(u,v+15,26);
    out+=pvBox(u-8,v-8,16,16,-14,2,'#b4bbb7','#868f8d','#919b98');
    out+=`<path d="M${a.join(',')}L${b.join(',')}L${c.join(',')}L${d.join(',')}" fill="none" stroke="#c2c7c1" stroke-width="5" stroke-linejoin="round"/>`;
    out+=`<circle cx="${pp(u-3,v-2,-9)[0]}" cy="${pp(u-3,v-2,-9)[1]}" r="1.8" fill="#333e43"/>`;
  }
  out+=`<g class="pv-part" id="pv-rails">`;
  for(const v of [83,160]){
    out+=pvBox(-8,v,354,12,37,13,'#ccd0c9','#8e9998','#a5afac');
    out+=line(pp(-8,v+5,38),pp(346,v+5,38),'#747f80',1.4);
  }
  out+='</g>';
  out+=`<g class="pv-part" id="pv-module">${pvBox(5,23,327,191,47,10,'#959f9d','#bfc4be','#acb6b2')}`;
  out+=poly([pp(10,28,48),pp(327,28,48),pp(327,209,48),pp(10,209,48)],'url(#pv-cells)','#b8c0ba');
  out+=line(pp(10,116,49),pp(327,116,49),'#929faa',.7);
  out+='</g>';
  // Four end clamps act at frame edges. The actual clamp zones are product-specific and not dimensioned.
  out+='<g class="pv-part" id="pv-clamps">';
  for(const u of [3,334])for(const v of [83,160]){
    const legU=u===3?-2:332;
    out+=pvBox(legU,v-1,7,14,47,10,'#bdc6bb','#929e98','#aab5ac');
    out+=pvBox(u-5,v-1,12,14,51,4,'#e0e1d6','#aeb6b0','#bec5bb');
    const b=pp(u+1,v+6,52);
    out+=line(b,pp(u+1,v+6,33),'#b5bfb5',1.8);
    out+=`<circle cx="${b[0]}" cy="${b[1]}" r="1.7" fill="#59666b"/>`;
  }
  out+='</g>';
  out+=`<g id="pv-callouts"><g fill="#d5c2a9" font-family="Plex,monospace" font-size="12"><text x="595" y="110">01</text><text x="595" y="223">02</text><text x="595" y="295">03</text><text x="595" y="359">04</text></g><g fill="none" stroke="#89938f" stroke-width=".7"><path d="M586 106h-52M586 219h-50M586 291h-56M586 355h-52"/></g></g>`;
  $('#pv-svg').innerHTML=out;
  $('#pv-detail-svg').innerHTML='<title id="pv-detail-title">Montierter, abstrahierter Befestigungsquerschnitt</title><desc id="pv-detail-desc">Endklemme am Rahmen; Rahmen auf Aluminium-Tragschiene; Schiene am Dachhaken; Dachhaken am Holz verschraubt. Freiraum zwischen Dachhaken und Ziegeldeckung. Ohne Maßstab und keine Ausführungsplanung.</desc><g transform="translate(23 38)"><path d="M0 63h202v43H0z" fill="#a38360" stroke="#d2b58e" stroke-width="1"/><path d="M5 73h190M7 83h189M5 96h190" stroke="#665849" stroke-width=".8" opacity=".65"/><path d="M-7 47h78m62 0h77" stroke="#9da5a2" stroke-width="7"/><path d="M60 60h29v-3l14-5V23h42" fill="none" stroke="#e0dfd1" stroke-width="6" stroke-linejoin="round"/><path d="M69 60v25m12-25v25" stroke="#d1d5ca" stroke-width="2.4"/><path d="M123 8h76v27h-76z" fill="#858f8e" stroke="#c9cfc5" stroke-width="1.8"/><path d="M123 16h76M139 8v27" stroke="#c9cfc5" stroke-width="1.2"/><circle cx="130" cy="23" r="3" fill="#ced4c8"/><path d="M39-1h143v9H39z" fill="#b1bab3" stroke="#d8dccf"/><path d="M44 1h117" stroke="#536675" stroke-width="4"/><path d="M170-6h20v6h-6v8h-10V2h-4z" fill="#dcded0" stroke="#c9d0c8" stroke-width=".8"/><path d="M180-5v30" stroke="#59696e" stroke-width="1.8"/><g fill="#e4dccd" font-family="Plex,monospace" font-size="11"><text x="204" y="0">01</text><text x="179" y="32">02</text><text x="112" y="62">03</text><text x="209" y="86">04</text></g></g>';

}
let pvOpen=true;
function updatePV() {
  const offsets={rails:pvOpen?41:0,module:pvOpen?130:0,clamps:pvOpen?130:0};
  for(const [part,delta]of Object.entries(offsets))$('#pv-'+part).style.transform=`translate(${-delta*.13}px,${-delta}px)`;
  $('#pv-callouts').style.opacity=pvOpen?'1':'0';
  $('#pv-explode').setAttribute('aria-pressed',String(pvOpen));
  $('#pv-explode').textContent=pvOpen?'Montiert ansehen':'Aufbau öffnen';
  $('#pv-state').textContent=pvOpen?'Schematische Explosionsansicht. Bauteile getrennt, Deckung lokal ausgeblendet. Das Detail unten zeigt den montierten Kraftweg.':'Zusammengesetzte Prinzipdarstellung, ohne Maßstab. Tatsächliche Klemmbereiche und Systemkompatibilität sind produktabhängig zu prüfen.';
}
drawPV();updatePV();
$('#pv-explode').addEventListener('click',()=>{pvOpen=!pvOpen;updatePV();});

// Demo form: intentionally no request, storage, external endpoint, or fake success.
const form=$('#contact-form');
const status=$('#form-status');
const contactInput=$('#contact-value');
function contactMethod(method) {
  contactInput.type=method;
  contactInput.autocomplete=method==='tel'?'tel':'email';
  contactInput.placeholder=method==='tel'?'Ihre Telefonnummer':'name@beispiel.de';
  contactInput.value='';
  contactInput.setCustomValidity('');
  $('#contact-label').textContent=method==='tel'?'Ihre Telefonnummer':'Ihre E-Mail';
}
$$('input[name="method"]').forEach(input=>input.addEventListener('change',()=>contactMethod(input.value)));
$$('[data-interest]').forEach(link=>link.addEventListener('click',()=>{
  $$('input[name="interest"]').forEach(input=>{input.checked=input.value===link.dataset.interest;});
  if(link.dataset.building)$('#building').value=link.dataset.building;
}));
form.addEventListener('submit',event=>{
  event.preventDefault();
  $('#name').setCustomValidity($('#name').value.trim()?'':'Bitte ausfüllen.');
  if(contactInput.type==='tel')contactInput.setCustomValidity((contactInput.value.replace(/[^0-9]/g,'').length>=6&&/^[0-9+()\s./-]+$/.test(contactInput.value))?'':'Bitte eine gültige Telefonnummer eingeben.');
  if(!form.reportValidity())return;
  status.hidden=false;
  status.focus({preventScroll:true});
  status.scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'nearest'});
});
form.addEventListener('input',event=>{if(event.target instanceof HTMLInputElement)event.target.setCustomValidity('');status.hidden=true;});
$('#reset-demo').addEventListener('click',()=>{
  form.reset();contactMethod('email');status.hidden=true;
  $('#request-extra').open=false;
  $('#name').focus({preventScroll:true});
});
form.querySelector('[type="submit"]').disabled=false;

const notes=$('#notes-dialog');
$('#open-notes').addEventListener('click',event=>{event.preventDefault();notes.showModal();});
$('.close-dialog').addEventListener('click',()=>notes.close());
notes.addEventListener('click',event=>{if(event.target===notes){const rect=notes.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)notes.close();}});

// Technical illustrations are optional. Native dialogs preserve the short main-page flow.
$$('[data-open-dialog]').forEach(trigger=>trigger.addEventListener('click',()=>{
  const dialog=document.getElementById(trigger.dataset.openDialog);
  if(dialog.id==='roof-dialog'){
    roofType=trigger.dataset.roofChoice||'pitched';
    $$('[data-roof]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.roof===roofType)));
    drawRoof();
  }
  dialog.showModal();
  dialog.scrollTop=0;
  document.body.style.overflow='hidden';
}));
$$('.tech-dialog').forEach(dialog=>{
  dialog.querySelector('.close-tech').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{document.body.style.overflow='';});
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
  });
  dialog.querySelectorAll('a[href="#kontakt"]').forEach(link=>link.addEventListener('click',()=>dialog.close()));
});
