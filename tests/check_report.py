#!/usr/bin/env python3
"""
Runs report.html in a headless browser (Edge or Chrome, already on Windows; no Node needed) and
renders every commander x bracket panel, catching JavaScript errors. The page is served from a small
local server, as in the app, whose /deck stub answers the EDHREC weight / spending buttons with a known
deck plus one new card (s=3 answers "not found"), so the live-deck path is tested without EDHREC.

Usage:  py tests/check_report.py [report.html]
Exit code 0 = no errors.
"""
import http.server, json, os, re, shutil, subprocess, sys, tempfile, threading, urllib.parse

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "msedge", "google-chrome", "chromium", "chrome",
]

# runs before the page's own script: records uncaught errors
CATCH = "<script>window.__dwTest=1;window.__errs=[];window.addEventListener('error',e=>__errs.push('page: '+e.message));</script>"   # __dwTest: instant scrolls (headless virtual time)
# runs after it: renders every panel the user could open
PROBE = """<script>setTimeout(()=>{const out={panels:0,errs:window.__errs,rows:document.querySelectorAll('#list details.row').length};
try{for(const d of DATA)for(const b of BR){if(!d.b[b])continue;try{const h=body(d,b);if(!h||h.includes('undefined'))out.errs.push(d.name+' | '+b+': text contains "undefined"');out.panels++;}
catch(e){out.errs.push(d.name+' | '+b+': '+e.message);}}}catch(e){out.errs.push('probe: '+e.message);}
try{const r=document.querySelector('details.row[data-i]');if(r){r.open=true;r.querySelector('.body').innerHTML=body(DATA[+r.dataset.i],bk());r.dataset.f=1;
  for(const k of [...r.querySelectorAll('[data-bsel]')].map(c=>c.dataset.bsel)){
    r.querySelector('[data-bsel="'+k+'"]').click();const on=r.querySelector('.bk.on');   // re-query: a click re-renders the panel
    if(!on||on.dataset.bsel!==k)out.errs.push('bracket chip '+k+' did not switch the deck');}
  out.clicks=(out.clicks||0)+r.querySelectorAll('[data-bsel]').length;
  }}
catch(e){out.errs.push('clicks: '+e.message);}
try{for(const k of DECKS){const h=ibody(k);if(!h||h.includes('undefined'))out.errs.push('imported '+k.title+': "undefined"');out.panels++;}}
catch(e){out.errs.push('imported decks: '+e.message);}
// archetype tree: every archetype x source x bracket renders; archetype and source combine; Overview goes back
try{for(const d of DATA)for(const t of Object.keys(d.th||{}))for(const b of BR){if(!d.b[b])continue;
    for(const a of ["0","1"]){const h=body(d,b,{dataset:{t,a,b}});if(!h||h.includes('undefined'))out.errs.push(d.name+' | '+b+' | '+t+' | avg '+a+': panel has "undefined"');out.panels++;}}
  for(const d of DATA)for(const b of Object.keys(d.av||{})){const h=body(d,b,{dataset:{a:"1",b}});
    if(!h||h.includes('undefined'))out.errs.push(d.name+' | '+b+' | average deck: panel has "undefined"');out.panels++;}
  const d=DATA.find(d=>Object.values(d.th||{}).some(t=>t.av&&t.av[bk()])), r=d&&document.querySelector('details.row[data-i="'+d.i+'"]');
  if(r){r.open=true;r.dataset.b=bk();rerow(r);const t=Object.keys(d.th).find(k=>d.th[k].av&&d.th[k].av[bk()]);
    r.querySelector('.thm[data-tsel="'+t+'"]').click(); if(!r.querySelector('.thm.on'))out.errs.push('archetype click did not select it');
    r.querySelector('[data-asel="1"]').click();
    if(!r.querySelector('.thm.on')||!r.querySelector('.srcb.on[data-asel="1"]'))out.errs.push('archetype + average deck did not combine');
    if(!r.querySelector('.tnote').textContent.includes(d.th[t].name+' average deck'))out.errs.push('archetype average deck note missing');
    r.querySelector('[data-asel="0"]').click(); if(!r.querySelector('.thm.on')||r.querySelector('.srcb.on[data-asel="1"]'))out.errs.push('commander page did not keep the archetype');
    r.querySelector('[data-tsel=""]').click(); if(r.querySelector('.thm.on'))out.errs.push('Overview did not go back');
    out.clicks=(out.clicks||0)+5;}
  else out.errs.push('no archetype with an average deck to test');}
catch(e){out.errs.push('archetypes: '+e.message);}
// page-wide source selector: "Average deck" switches the list and the panels, "Commander page" goes back
try{const tb=document.querySelector('[data-src="avg"]');
  if(!tb)out.errs.push('no Average deck selector at the top');
  else{tb.click(); if(!$('count').textContent.includes('average deck'))out.errs.push('top selector did not switch the list');
    const r=document.querySelector('details.row[data-i]');
    if(r){r.open=true; rerow(r); if(!r.querySelector('.srcb.on[data-asel="1"]'))out.errs.push('panel did not follow the top selector');
      if(!r.querySelector('.pile .ca i.hatch'))out.errs.push('mana curve note has no average-deck bars');}
    document.querySelector('[data-src=""]').click(); if($('count').textContent.includes('average deck'))out.errs.push('top selector did not go back');
    out.clicks=(out.clicks||0)+2;}}
catch(e){out.errs.push('top selector: '+e.message);}
// Discover filters: a colour chip keeps only commanders with that colour; "you own at least 80%" keeps 80%+;
// pressing them again / ANY brings every commander back
try{const all=document.querySelectorAll('#list details.row').length, k=DATA[0].ci[0]||'U';
  document.querySelector('[data-col="'+k+'"]').click();
  const rows=[...document.querySelectorAll('#list details.row')].map(r=>DATA[+r.dataset.i]);
  if(rows.some(d=>!d.ci.includes(k)))out.errs.push('colour chip '+k+' let other colours through');
  document.querySelector('[data-col="'+k+'"]').click();
  document.querySelector('[data-minp="80"]').click();
  if([...document.querySelectorAll('#list details.row')].some(r=>X(DATA[+r.dataset.i],bk()).pct<80))out.errs.push('"own at least 80%" let lower rows through');
  document.querySelector('[data-minp="0"]').click();
  if(document.querySelectorAll('#list details.row').length!==all)out.errs.push('filters did not reset');
  if(!document.querySelector('#list details.row .bat'))out.errs.push('no battery on the commander cards');
  out.clicks=(out.clicks||0)+4;}
catch(e){out.errs.push('discover filters: '+e.message);}
// commander panel: photocopy toggle, slim bar archetype select, a gaps option card (wired to the saved choices)
try{const d=DATA.find(d=>Object.keys(d.th||{}).length&&d.b.all), r=d&&document.querySelector('details.row[data-i="'+d.i+'"]');
  if(r){r.open=true;r.dataset.b='all';r.dataset.t='';r.dataset.a='0';rerow(r);
    if(!r.querySelector('.slim .ondeck'))out.errs.push('no slim bar with ON DECK');
    if(!r.querySelector('.tile .mburst'))out.errs.push('no starburst behind the Match score');
    r.querySelector('[data-imgm="copy"]').click(); if(document.documentElement.dataset.img!=='copy')out.errs.push('photocopy toggle did not switch');
    r.querySelector('[data-imgm="full"]').click();
    const t=Object.keys(d.th)[0], s=r.querySelector('.slim .tsel'); s.value=t; s.dispatchEvent(new Event('change',{bubbles:true}));
    if(r.dataset.t!==t||!r.querySelector('.thm.on[data-tsel="'+t+'"]'))out.errs.push('slim bar archetype select did not switch');
    r.querySelector('[data-tsel=""]').click(); out.clicks=(out.clicks||0)+4;}
  const b=bk(), g=DATA.find(d=>d.b[b]&&d.b[b].deck.some(e=>e[1]==='s'&&e[2]>=0)), rg=g&&document.querySelector('details.row[data-i="'+g.i+'"]');
  if(rg){rg.open=true;rg.dataset.b=b;rg.dataset.t='';rg.dataset.a='0';rerow(rg);
    const e=g.b[b].deck.find(e=>e[1]==='s'&&e[2]>=0); rg.querySelector('.gopt[data-slot="'+e[2]+'"][data-pick="-1"]').click();
    if(!rg.querySelector('.gopt.on[data-slot="'+e[2]+'"][data-pick="-1"]')||!rg.querySelector('.shop').textContent.includes(front(e[2])))out.errs.push('gaps "Buy it" card did not choose the slot');
    if(!rg.querySelector('.gopt.on .stk'))out.errs.push('no (CHOSEN!) sticker');
    rg.querySelector('.reset-ch').click(); out.clicks=(out.clicks||0)+2;}}
catch(e){out.errs.push('panel: '+e.message);}
// "Why this card?": starts on a card, hover previews, a click pins (red outline, PINNED), a second click or Esc lets go
try{const d=DATA.find(d=>d.b.all), r=d&&document.querySelector('details.row[data-i="'+d.i+'"]');
  if(r){r.open=true;r.dataset.b='all';r.dataset.t='';r.dataset.a='0';rerow(r);
    const box=r.querySelector('.why'), cws=[...r.querySelectorAll('.d99 .cw[data-wi]')];
    if(!box||!box.querySelector('.wname'))out.errs.push('why panel is empty');
    if(!CARDS.some(c=>c[6]>0))out.errs.push('card rows carry no roles');
    const a=cws[1], b2=cws[2], nm=x=>x.querySelector('img.c').alt.split(' // ')[0];
    a.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
    if(!box.textContent.toUpperCase().includes(nm(a).toUpperCase()))out.errs.push('hover did not preview the card');
    a.querySelector('.ct').click();
    if(!a.classList.contains('wpin')||!box.textContent.includes('PINNED'))out.errs.push('click did not pin the card');
    b2.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
    if(!box.textContent.toUpperCase().includes(nm(a).toUpperCase()))out.errs.push('hover changed a pinned panel');
    a.querySelector('.ct').click(); if(a.classList.contains('wpin'))out.errs.push('second click did not unpin');
    a.querySelector('.ct').click(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
    if(a.classList.contains('wpin'))out.errs.push('Esc did not unpin');
    if(!box.getAttribute('aria-live'))out.errs.push('why panel is not aria-live');
    out.clicks=(out.clicks||0)+5;}}
catch(e){out.errs.push('why: '+e.message);}
// print modes: each header button switches the page's mode and marks itself pressed
try{for(const m of ["pos","sepia","neg"]){const b=document.querySelector('.modes [data-mode="'+m+'"]');
    if(!b){out.errs.push('no print-mode button '+m);continue;} b.click();
    if(document.documentElement.dataset.mode!==m||b.getAttribute('aria-pressed')!=='true')out.errs.push('print mode '+m+' did not switch');}
  out.clicks=(out.clicks||0)+3;}
catch(e){out.errs.push('modes: '+e.message);}
// substitute slot: its hover bubble (missing card greyed, using yours) offers an alternative, then "buy", then reset
try{const hasAlt=(d,b)=>d.b[b]&&d.b[b].deck.some(e=>e[1]==='s'&&(e[4]||[]).length);   // any bracket: few decks have slots
  const b=[bk()].concat(BR).find(b=>DATA.some(d=>hasAlt(d,b))), d=b&&DATA.find(d=>hasAlt(d,b));
  const r=d&&document.querySelector('details.row[data-i="'+d.i+'"]');
  if(r){r.open=true;r.dataset.b=b;rerow(r);
    const e=d.b[b].deck.find(e=>e[1]==='s'&&(e[4]||[]).length), alt=e[4][0][0];
    const bq=sel=>r.querySelector('.bub .opt[data-slot="'+e[2]+'"]'+sel);
    if(!bq(''))out.errs.push('substitute slot has no hover bubble');
    bq('[data-pick="'+alt+'"]').click();
    if(!r.querySelector('textarea').value.includes(front(alt)))out.errs.push('picked alternative not in the deck list');
    bq('[data-pick="-1"]').click();
    if(!(r.querySelector('.shop')||{}).textContent.includes(front(e[2])))out.errs.push('bought card not on the shopping list');
    const sl=r.querySelector('.shop a.shopl'); if(!sl||!sl.href.includes(encodeURIComponent(front(e[2])).slice(0,8))||!sl.href.startsWith('http'))out.errs.push('shopping list has no store link for the card');
    r.querySelector('.reset-ch').click();
    if(Object.keys(getCh(d,b)).length)out.errs.push('reset did not clear choices');
    out.clicks=(out.clicks||0)+5;}
  else out.errs.push('no substitute with alternatives found to test');}
catch(e){out.errs.push('chooser: '+e.message);}
// "your pick" options: swap in an owned alternative, then the EDHREC card to buy, then reset
try{const O=e=>e.length>3?OPTS[e[3]]:[[],-1], b=bk(), d=DATA.find(d=>d.b[b]&&d.b[b].deck.some(e=>e[1]==='y'&&O(e)[0].length&&O(e)[1]>=0));
  const r=d&&document.querySelector('details.row[data-i="'+d.i+'"]');
  if(r){r.open=true;r.dataset.b=b;r.dataset.t="";r.dataset.a="0";rerow(r);
    const e=d.b[b].deck.find(e=>e[1]==='y'&&O(e)[0].length&&O(e)[1]>=0), alt=O(e)[0][0][0];
    const bq=sel=>r.querySelector('.bub .opt[data-slot="y'+e[0]+'"]'+sel);
    if(!bq(''))out.errs.push('your pick has no hover bubble');
    bq('[data-pick="'+alt+'"]').click();
    const ta=r.querySelector('textarea').value;
    if(!ta.includes(front(alt)))out.errs.push('swapped-in card not in the deck list');
    if(ta.split('\\n').includes('1 '+front(e[0])))out.errs.push('swapped-out pick still in the deck list');
    bq('[data-pick="-1"]').click();
    if(!(r.querySelector('.shop')||{}).textContent.includes(front(O(e)[1])))out.errs.push('EDHREC card not on the shopping list');
    r.querySelector('.reset-ch').click();
    if(!r.querySelector('textarea').value.includes(front(e[0])))out.errs.push('reset did not bring the pick back');
    out.clicks=(out.clicks||0)+5;}
  else out.errs.push('no "your pick" with options found to test');}
catch(e){out.errs.push('pick chooser: '+e.message);}
// EDHREC weight / spending: weight 1 builds through /deck (stub), the new card is added and shown;
// $$$ shows the app's error; weight 3 + $$ goes back to the report's own deck
const wait=(c,max=100)=>new Promise(res=>{let n=0;const f=()=>c()||++n>max?res():setTimeout(f,50);f();});
(async()=>{try{const d=DATA.find(d=>d.b.all), r=d&&document.querySelector('details.row[data-i="'+d.i+'"]');
  if(!r)out.errs.push('no row for the level test');
  else{r.open=true;r.dataset.b="all";r.dataset.t="";r.dataset.a="0";rerow(r);const n0=CARDS.length;
    r.querySelector('[data-wsel="1"]').click();
    await wait(()=>!r.querySelector('.body').textContent.includes('Building the deck'));
    if(CARDS.length!==n0+1)out.errs.push('live deck: new card row not added ('+(CARDS.length-n0)+'); state: '+JSON.stringify(Object.values(LIVE)[0]||null).slice(0,160));
    const ta=r.querySelector('textarea');
    if(!ta||!ta.value.includes('Test Card Live'))out.errs.push('live deck: new card not in the deck list');
    if(!r.querySelector('.tnote')||!r.querySelector('.tnote').textContent.includes('EDHREC weight 1'))out.errs.push('live deck: level not in the note');
    r.querySelector('[data-ssel="3"]').click();
    await wait(()=>!r.querySelector('.body').textContent.includes('Building the deck'));
    if(!r.querySelector('p.thinw')||!r.querySelector('p.thinw').textContent.includes('Stub: no expensive page'))out.errs.push('live deck: error not shown');
    r.querySelector('[data-wsel="3"]').click();r.querySelector('[data-ssel="2"]').click();
    if(r.querySelector('textarea').value.includes('Test Card Live'))out.errs.push('weight 3 + $$ did not go back to the report deck');
    out.clicks=(out.clicks||0)+4;}}
  catch(e){out.errs.push('levels: '+e.message);}
// pins: "always include" a typed card (stub /pins answers, then the deck is rebuilt through /deck), a bad
// name shows the app's error, and removing the pin goes back to the report's deck
try{const d=DATA.find(d=>d.b.all), r=d&&document.querySelector('details.row[data-i="'+d.i+'"]');
  if(r){r.open=true;r.dataset.b="all";r.dataset.t="";r.dataset.a="0";r.dataset.w="3";r.dataset.s="2";rerow(r);
    r.querySelector('.pinq').value='Pinned Test Card'; r.querySelector('[data-pinadd="in"]').click();
    await wait(()=>r.querySelector('.pins')&&r.querySelector('.pins').textContent.includes('Pinned Test Card')&&!r.querySelector('.body').textContent.includes('Building the deck'));
    if(!r.querySelector('.pins').textContent.includes('Pinned Test Card'))out.errs.push('pin chip not shown');
    if(!r.querySelector('textarea')||!r.querySelector('textarea').value.includes('Test Card Live'))out.errs.push('pinned: deck was not rebuilt through the app');
    r.querySelector('.pinq').value='Nope Card'; r.querySelector('[data-pinadd="out"]').click();
    await wait(()=>(r.querySelector('.pinerr')||{}).textContent.includes('Stub: not in your collection'));
    if(!(r.querySelector('.pinerr')||{}).textContent.includes('Stub: not in your collection'))out.errs.push('pin error not shown');
    r.querySelector('[data-unpin="Pinned Test Card"]').click();
    await wait(()=>!r.querySelector('.pins').textContent.includes('Pinned Test Card'));
    if(r.querySelector('textarea').value.includes('Test Card Live'))out.errs.push('unpinned: deck did not go back to the report deck');
    out.clicks=(out.clicks||0)+3;}}
  catch(e){out.errs.push('pins: '+e.message);}
  // P5 layer: ticker with real numbers, ransom title, #1-#3 tags, open panel's deck cards slide in when on screen
  try{if(!document.querySelector('#tick span')||!document.querySelector('#tick').textContent.includes('commanders'))out.errs.push('ticker is empty');
    if(document.querySelectorAll('#ttl .rl').length<10)out.errs.push('ransom title missing');
    const nr=document.querySelectorAll('#list details.row').length, nt=document.querySelectorAll('#list details.row .rank').length;
    if(nt!==Math.min(3,nr))out.errs.push('expected '+Math.min(3,nr)+' rank tags, found '+nt);
    // a commander that's closed now (re-opening one in the same task fires no toggle event)
    const r=document.querySelector('details.row[data-i]:not([open])')||document.querySelector('details.row[data-i]');
    if(r.open){r.open=false; await new Promise(res=>setTimeout(res,50));}
    r.open=true; await wait(()=>r.querySelector('.body .grid .ct.p5-wait, .body .grid .ct.p5-shown'),40);   // the panel is being watched
    r.querySelector('.body .grid .ct').scrollIntoView({block:'center'});
    window.dispatchEvent(new Event('scroll'));   // headless Edge (simulated clock) sends no scroll event without frames
    await wait(()=>r.querySelector('.ct.p5-shown'),Math.max(40,Math.ceil(DATA.length/2)));   // frames are slower on big pages
    if(!r.querySelector('.pname .rl'))out.errs.push('open panel has no ransom name');
    if(!r.querySelector('.ct.p5-shown'))out.errs.push('deck cards never slid in (IntersectionObserver): open '+r.open+', cards '+r.querySelectorAll('.body .grid .ct').length
      +', waiting '+r.querySelectorAll('.ct.p5-wait').length+', watched '+P5ON.length+', observer '+!!P5IO);
    out.clicks=(out.clicks||0)+1;}
  catch(e){out.errs.push('p5: '+e.message);}
  // one hover menu for every card: swap a POPULAR, a FILLER and a COMBO card (any commander / bracket that has one);
  // the swapped card shows YOUR SWAP with a greyed "was" thumbnail, a combo card warns first, reset brings it back
  try{out.notes=out.notes||[];
    for(const k of ['p','f','c']){let hit=null;
      for(const d of DATA){for(const b of Object.keys(d.b)){const e=d.b[b].deck.find(e=>e[1]===k&&e.length>3&&OPTS[e[3]][0].length); if(e){hit={d,b,e};break;}} if(hit)break;}
      if(!hit){out.notes.push('no '+{p:'POPULAR',f:'FILLER',c:'COMBO'}[k]+' card with options in this report: menu not tested'); continue;}
      const {d,b,e}=hit, alt=OPTS[e[3]][0][0][0], r=document.querySelector('details.row[data-i="'+d.i+'"]');
      r.open=true; r.dataset.b=b; r.dataset.t=""; r.dataset.a="0"; rerow(r);
      const cw=[...r.querySelectorAll('.d99 .cw.k-'+k)].find(c=>c.querySelector('.bub .opt[data-slot="y'+e[0]+'"]'));
      if(!cw){out.errs.push(k+' card has no hover menu'); continue;}
      if(k==='c'&&!cw.querySelector('.bub .cwarn'))out.errs.push('combo card menu has no "breaks combo" warning');
      cw.querySelector('.bub .opt[data-pick="'+alt+'"]').click();
      const sw=[...r.querySelectorAll('.d99 .cw.k-y2')].find(c=>c.querySelector('img.c').alt===CARDS[alt][0]);
      if(!sw)out.errs.push(k+' swap: the chosen card is not shown as YOUR SWAP');
      else if(!sw.querySelector('.was img')||!sw.querySelector('.was').title.includes(front(e[0])))out.errs.push(k+' swap: no greyed "was" thumbnail of the card it replaced');
      if(!r.querySelector('textarea').value.includes(front(alt)))out.errs.push(k+' swap: the swapped-in card is not in the deck list');
      r.querySelector('.reset-ch').click();
      if(!r.querySelector('textarea').value.split('\\n').includes('1 '+front(e[0])))out.errs.push(k+' swap: reset did not bring the card back');
      out.clicks=(out.clicks||0)+2;}
    // one label system: the legend shows the 8 tapes in order, every tape explains itself, nothing in the 99 is greyed
    const r=document.querySelector('details.row[data-i][open]'), lg=[...r.querySelectorAll('.tlg .tape')].map(t=>t.textContent);
    if(lg.join('|')!=='POPULAR|GOOD FIT|ALWAYS IN|COMBO|FILLER|STAND-IN|YOUR SWAP|TO BUY')out.errs.push('legend tapes: '+lg.join('|'));
    if([...r.querySelectorAll('.d99 .tape')].some(t=>!t.title))out.errs.push('a tape has no meaning in its title');
    if(r.querySelector('.d99 .ct.nown, .d99 .ct.miss'))out.errs.push('a card in the 99 is greyed or outlined as missing');}
  catch(e){out.errs.push('swap menus: '+e.message);}
  // autocomplete: type in each search box, pick a suggestion with the keyboard (ArrowDown, Enter); Esc closes
  try{const acl=$('acl'), key=(el,k)=>el.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
    const typ=(el,v)=>{el.focus(); el.value=v; el.dispatchEvent(new Event('input',{bubbles:true}));};
    if(fold('Grishnákh')!=='grishnakh'||!acMark('Grishnákh','nak').includes('<mark>nák</mark>'))out.errs.push('autocomplete does not ignore accents');
    const q=$('q'), d0=DATA[0], part=fold(d0.name).slice(1,4);
    typ(q,part);
    if(acl.hidden||!acl.querySelector('li[role="option"]'))out.errs.push('commander search shows no suggestions for "'+part+'"');
    else{if(q.getAttribute('aria-expanded')!=='true'||!acl.querySelector('mark'))out.errs.push('commander suggestions: no aria-expanded or no marked letters');
      if(acl.children.length>8)out.errs.push('more than 8 suggestions');
      const want=ACH[0].name; key(q,'ArrowDown');
      if(acl.children[0].getAttribute('aria-selected')!=='true'||q.getAttribute('aria-activedescendant')!=='acl-0')out.errs.push('ArrowDown did not select the first suggestion');
      key(q,'Enter'); await new Promise(z=>setTimeout(z,50));
      if(!acl.hidden)out.errs.push('Enter did not close the suggestions');
      if(![...document.querySelectorAll('#list details.row[open]')].some(r=>DATA[+r.dataset.i].name===want))out.errs.push('picking a commander did not open its panel');
      typ(q,part); key(q,'Escape'); if(!acl.hidden)out.errs.push('Esc did not close the suggestions');}
    q.value=''; render();
    // the pin box (app only): suggestions are only cards you own in this commander's colours; picking fills the box
    const r=document.querySelector('#list details.row[data-i]'); r.open=true; rerow(r); const pq=r.querySelector('.pinq');
    if(!pq)out.errs.push('no pin box in the app');
    else{const d=DATA[+r.dataset.i], cm=d.ci.reduce((m,c)=>m|(1<<'WUBRG'.indexOf(c)),0), mine=(ST.own||[]).filter(o=>(o[1]&~cm)===0);
      if(!mine.length)out.errs.push('no owned cards to suggest for pins');
      else{const nm=CARDS[mine[0][0]][0]; typ(pq,fold(nm).slice(0,4));
        const names=new Set(mine.map(o=>CARDS[o[0]][0]));
        if(acl.hidden)out.errs.push('pin box shows no suggestions');
        else{if(ACH.some(it=>!names.has(it.name)))out.errs.push('pin box suggests a card outside the commander colours');
          key(pq,'ArrowDown'); key(pq,'Enter'); if(pq.value!==ACH[0].name&&!names.has(pq.value))out.errs.push('picking a pin suggestion did not fill the box');
          if(!acl.hidden)out.errs.push('pin suggestions stayed open after picking');}}}
    out.clicks=(out.clicks||0)+6;}
  catch(e){out.errs.push('autocomplete: '+e.message);}
  // your decks (app): paste a list and save it; it appears and opens; the same name asks before replacing; delete removes it
  try{showView('collection'); const box=document.querySelector('#imp .dadd');
    if(!box)out.errs.push('no "Add a deck" box in the app');
    else{window.confirm=()=>true;
      box.querySelector('.dtext').value='Commander\\n1 '+DATA[0].name+'\\n\\nDeck\\n1 Sol Ring';
      box.querySelector('.dname').value='Check Deck'; box.querySelector('.dsave').click();
      await wait(()=>[...document.querySelectorAll('#imp details.irow')].some(r=>DECKS[+r.dataset.k].title==='Check Deck'),60);
      const row=[...document.querySelectorAll('#imp details.irow')].find(r=>DECKS[+r.dataset.k].title==='Check Deck');
      if(!row)out.errs.push('saved deck did not appear under Your decks');
      else{if(!row.open)out.errs.push('saved deck did not open');
        // F4: the saved deck opens with its analysis
        await wait(()=>row.querySelector('.an'),40);   // the body is filled on the toggle event, a moment after opening
        const an=row.querySelector('.an');
        if(!an)out.errs.push('saved deck has no Deck analysis');
        else{if(!/B3/.test((an.querySelector('.tile .tbig')||{}).textContent||''))out.errs.push('analysis: no bracket tile');
          if(!an.querySelector('.ang li')||!an.querySelector('.anb li'))out.errs.push('analysis: no strengths / weaknesses');
          if(an.querySelectorAll('.anl .alt').length<2)out.errs.push('analysis: no cards to add / cut');
          if(!/free|all [0-9]/.test(an.textContent))out.errs.push('analysis: suggestions do not show free copies');}
        const b2=document.querySelector('#imp .dadd'); b2.querySelector('.dtext').value='1 Sol Ring'; b2.querySelector('.dname').value='Check Deck'; b2.querySelector('.dsave').click();
        await new Promise(z=>setTimeout(z,300));
        if(DECKS.filter(d=>d.title==='Check Deck').length!==1)out.errs.push('replacing a deck made a second copy');
        // F3: a second deck with the same cards -> those you own once are short; counts follow the saved decks
        const b3=document.querySelector('#imp .dadd'); b3.querySelector('.dtext').value='1 Sol Ring'; b3.querySelector('.dname').value='Check Deck 2'; b3.querySelector('.dsave').click();
        await wait(()=>DECKS.some(d=>d.title==='Check Deck 2'),60);
        if(!(($('unused').querySelector('.ulead')||{}).textContent||'').includes('saved deck'))out.errs.push('unused cards are not counted against your saved decks');
        const once=DECKS[0].cards.map(c=>c[0]).filter(i=>OWNQ.get(i)===1);
        if(once.length&&!$('unused').querySelector('.ushort li'))out.errs.push('cards used by two decks but owned once are not listed as short');
        const r2=[...document.querySelectorAll('#imp details.irow')].find(r=>DECKS[+r.dataset.k].title==='Check Deck 2'); r2.open=true; await new Promise(z=>setTimeout(z,50));
        if(once.length&&![...r2.querySelectorAll('.note')].some(x=>/^(short|also in)/.test(x.textContent)))out.errs.push('deck cards do not show short / also in');
        if(usage().get(DECKS[0].cards[0][0]).d.length!==2)out.errs.push('usage() does not list both decks for a shared card');
        const d2=r2.querySelector('[data-ddel]'); d2.click(); await wait(()=>!DECKS.some(d=>d.title==='Check Deck 2'),60);
        if($('unused').querySelector('.ushort li'))out.errs.push('short list did not clear after deleting the second deck');
        const del=[...document.querySelectorAll('#imp details.irow')].find(r=>DECKS[+r.dataset.k].title==='Check Deck');
        if(!del.open){del.open=true; await new Promise(z=>setTimeout(z,50));}
        const db=del.querySelector('[data-ddel]'); if(!db)out.errs.push('no delete button on a saved deck'); else{db.click();
          await wait(()=>!DECKS.some(d=>d.title==='Check Deck'),60);
          if(DECKS.some(d=>d.title==='Check Deck'))out.errs.push('deleted deck is still listed');}}}
    showView('discover'); out.clicks=(out.clicks||0)+4;}
  catch(e){out.errs.push('your decks: '+e.message);}
  // Deck stats pile: each tab brings its note to the front (aria-selected, one visible note) and is remembered in dw:stat
  try{const r=document.querySelector('details.row[data-i][open]')||document.querySelector('details.row[data-i]'); if(!r.open){r.open=true; await new Promise(z=>setTimeout(z,50));}
    const pile=r.querySelector('.pile'); if(!pile)out.errs.push('no deck stats pile');
    else{for(const k of ['types','power','combos','curve']){pile.querySelector('.ptab[data-stat="'+k+'"]').click();
        const vis=[...pile.querySelectorAll('.pnote')].filter(n=>!n.hidden);
        if(vis.length!==1||!vis[0].classList.contains('n-'+k)||pile.querySelector('.ptab[aria-selected="true"]').dataset.stat!==k||pile.querySelectorAll('.pback').length!==2)
          out.errs.push('stats tab '+k+' did not come to the front');}
      if(pile.querySelectorAll('.pnote.n-power .pcells').length!==7)out.errs.push('power profile should have 7 meters');
      if(!pile.querySelector('.pnote.n-combos .nbest'))out.errs.push('combos note has no best-combo box');
      out.clicks=(out.clicks||0)+4;}}
  catch(e){out.errs.push('stats pile: '+e.message);}
  // Discover: sticky header + sidebar (bracket and Popular cards / Typical deck inside it), the sidebar stays with a panel open
  // (narrow screens: a Filters button), one panel at a time, 3 archetypes, Discover / logo / Reset filters reset
  try{const f=document.querySelector('.disc .filt'), narrow=innerWidth<=900, vis=()=>getComputedStyle(f).display!=='none';
    if(getComputedStyle(document.querySelector('.zh')).position!=='sticky')out.errs.push('header is not sticky');
    if(getComputedStyle(f).position!=='sticky'&&!narrow)out.errs.push('filter sidebar is not sticky');
    if(!f.querySelector('#br')||!f.querySelector('.srcsel'))out.errs.push('bracket slider / deck switch are not in the sidebar');
    const sw=[...f.querySelectorAll('.srcsel .srcb')].map(x=>x.textContent.trim());
    if(sw.join('|')!=='Popular cards|Typical deck'||[...f.querySelectorAll('.srcsel .srcb')].some(x=>!x.title))out.errs.push('switch labels / tooltips: '+sw.join('|'));
    if(narrow){const tg=document.querySelector('.ftog'); if(vis())out.errs.push('narrow screen: sidebar should start hidden');
      tg.click(); if(!vis()||tg.getAttribute('aria-expanded')!=='true')out.errs.push('Filters button did not open the sidebar'); tg.click();}
    const rs=[...document.querySelectorAll('#list details.row[data-i]')]; rs.forEach(x=>x.open=false); await new Promise(z=>setTimeout(z,50));
    rs[0].open=true; await wait(()=>rs[0].querySelector('.body .hero'),40);
    if(!narrow&&!vis())out.errs.push('sidebar hidden while a panel is open');
    if(rs[0].querySelectorAll('.srcb.thm').length>3)out.errs.push('more than 3 archetype buttons');
    if(rs[0].querySelector('[data-asel="0"]')&&!/^Popular cards/.test(rs[0].querySelector('[data-asel="0"]').textContent))out.errs.push('panel switch not renamed');
    if(rs.length>1){rs[1].dataset.noscroll='1'; rs[1].open=true; await wait(()=>!rs[0].open&&rs[1].querySelector('.body .hero'),60); delete rs[1].dataset.noscroll;
      if(rs[0].open||!rs[1].open)out.errs.push('opening a commander did not close the other one: open = '+rs.map(r=>r.open?1:0).join(''));}
    // Discover resets: search cleared, panels closed
    $('q').value='zz'; render(); document.querySelector('.vnav [data-view="discover"]').click(); await new Promise(z=>setTimeout(z,50));
    if($('q').value||document.querySelector('#list details.row[open]')||!document.querySelectorAll('#list details.row').length)out.errs.push('Discover did not reset the list');
    // Reset filters
    document.querySelector('[data-col="U"]').click(); $('so').value='decks'; document.querySelector('.rstf').click();
    if(document.querySelector('[data-col][aria-pressed="true"]')||$('so').value!=='pct'||COLS.size)out.errs.push('Reset filters left a filter on');
    out.clicks=(out.clicks||0)+5;}
  catch(e){out.errs.push('discover fixes: '+e.message);}
  // panel round 2: pips by the name, top-3 swaps (click swaps + scratch-off, again undoes), top-10 to buy (scratch-off),
  // pin hint, stand-in buy link, the gap's image is the buy link
  try{const r=document.querySelector('#list details.row[data-i]'); r.dataset.noscroll='1'; r.open=true; await wait(()=>r.querySelector('.body .hero'),60);
    const d=DATA[+r.dataset.i], b=rowB(r);
    if(!r.querySelector('.pname .tpips .pip')&&d.ci.length)out.errs.push('no colour pips next to the commander name');
    const bs=r.querySelector('.bsw');
    if(bs){const a=+bs.dataset.bsw, o=+bs.dataset.out; bs.click(); await new Promise(z=>setTimeout(z,50));
      const on=r.querySelector('.bsw[data-out="'+o+'"]');
      if(!on||!on.classList.contains('on')||!on.querySelector('.scr.done'))out.errs.push('top swap: not marked / no scratch-off');
      const ta=r.querySelector('textarea').value;
      if(!ta.includes('1 '+front(a))||ta.split('\\n').includes('1 '+front(o)))out.errs.push('top swap: deck list did not change');
      on.click(); await new Promise(z=>setTimeout(z,50));
      if(!r.querySelector('textarea').value.split('\\n').includes('1 '+front(o)))out.errs.push('top swap: clicking again did not undo');}
    else out.notes=(out.notes||[]).concat(['no top swap to test for '+d.name]);
    const tb=r.querySelector('.ptb [data-tbs]');
    if((X(d,b).gaps||[]).length&&!tb)out.errs.push('no top-10 to buy list');
    if(tb){if(r.querySelectorAll('.ptb .tbl li').length>10)out.errs.push('to-buy list longer than 10');
      if(!r.querySelector('.ptb .tbl a.shopl'))out.errs.push('to-buy cards do not link to the shop');
      tb.click(); await new Promise(z=>setTimeout(z,50));
      if(!r.querySelector('.ptb .tbl li.done .scr.done'))out.errs.push('to-buy: no scratch-off after marking');
      r.querySelector('.ptb [data-tbu]').click(); await new Promise(z=>setTimeout(z,50));
      if(r.querySelector('.ptb .tbl li.done'))out.errs.push('to-buy: undo did not clear');}
    if(!r.querySelector('.pins .phint'))out.errs.push('no pin hint in the app');
    const g=r.querySelector('.gslot a.gmiss'); if(r.querySelector('.gslot')&&(!g||!g.querySelector('img.gimg')||!/^https?:/.test(g.href)))out.errs.push('gap card is not an image buy link');
    const sCw=r.querySelector('.d99 .cw.k-s'); if(sCw&&!sCw.querySelector('a.shopl'))out.errs.push('stand-in has no buy link');
    delete r.dataset.noscroll; out.clicks=(out.clicks||0)+5;}
  catch(e){out.errs.push('panel round 2: '+e.message);}
  // Collection view (#collection): opens without errors, the drop box is the only upload control (none in the header),
  // the unused grid starts at 24, "show all" and a commander chip work, a card's home link opens that commander in Discover
  try{if(document.querySelector('header.zh input[type=file], header.zh .up, header.zh button:not([data-mode])'))out.errs.push('header has an upload control');
    location.hash='#collection'; await wait(()=>!$('vcoll').hidden,40);
    if($('vcoll').hidden||!$('vdisc').hidden)out.errs.push('collection view did not open');
    if(!document.querySelector('.vnav [data-view="collection"][aria-current="page"]'))out.errs.push('nav does not mark Collection');
    if(document.querySelectorAll('#cttl .rl').length<10)out.errs.push('collection title missing');
    if(!document.querySelector('#coll .drop input[type=file]')||typeof dwUpload!=='function')out.errs.push('no drop box / dwUpload in the app');
    if(document.querySelectorAll('#coll input[type=file]').length!==1)out.errs.push('expected exactly one collection upload control');
    if(!$('imp').querySelector('h2'))out.errs.push('"Your decks" missing');
    if(ST.unused){const cnt=()=>document.querySelectorAll('#unused .ugrid .ucard').length, g=cnt();
      if(!g||g>24)out.errs.push('unused grid shows '+g+' cards first');
      const m=document.querySelector('#unused .umore'); if(m&&!m.hidden){m.click(); if(cnt()<=g)out.errs.push('show all did nothing');}
      const c=document.querySelector('#unused [data-uf]'); if(c){c.click(); if(c.getAttribute('aria-pressed')!=='true'||!cnt())out.errs.push('commander chip did not filter'); c.click();}
      const a=document.querySelector('#unused .ugrid a[data-cmdr]');
      if(a){a.click(); await wait(()=>!$('vdisc').hidden,40);
        if($('vdisc').hidden||!document.querySelector('#list details.row[open]'))out.errs.push('home link did not open the commander');}}
    out.clicks=(out.clicks||0)+1;}
  catch(e){out.errs.push('collection: '+e.message);}
  const p=document.createElement('pre');p.id='__test';p.textContent=JSON.stringify(out);document.body.appendChild(p);})();},500);</script>"""

def stub_server(html):
    """Serves the test page like the app does, with a stub /deck (see the module docstring)."""
    i = html.index("const DATA=") + len("const DATA=")
    data, _ = json.JSONDecoder().raw_decode(html[i:])
    SAVED = {}          # stub /decks: decks saved during this check
    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def send(self, code, body, ctype="application/json"):
            b = body.encode("utf-8")
            self.send_response(code); self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
        def do_GET(self):
            path, _, qs = self.path.partition("?")
            q = {k: v[0] for k, v in urllib.parse.parse_qs(qs).items()}
            if path == "/": return self.send(200, html, "text/html; charset=utf-8")
            if path == "/status": return self.send(200, json.dumps({"running": False, "ok": None}))
            if path == "/pins": return self.send(200, json.dumps({"pins": {}}))
            if path == "/decks":
                if self.headers.get("X-Deck-Wizard") != "1": return self.send(403, "{}")
                return self.send(200, json.dumps({"decks": list(SAVED.values()), "saved": None, "cards": [], "strs": [], "combos": [], "opts": []}))
            if path != "/deck": return self.send(404, "{}")
            if self.headers.get("X-Deck-Wizard") != "1": return self.send(403, json.dumps({"error": "no header"}))
            if q.get("s") == "3": return self.send(404, json.dumps({"error": "Stub: no expensive page."}))
            d = next(d for d in data if d["name"] == q["c"])
            x = dict(d["b"][q.get("b", "all")])
            x["deck"] = x["deck"] + [[int(q["nc"]), "y", int(q["ns"])]]
            self.send(200, json.dumps({"x": x, "cards": [["Test Card Live", "", "Creature", 0, 2]],
                                       "strs": ["stub reason"], "combos": []}))
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
            if self.path == "/decks" and self.headers.get("X-Deck-Wizard") == "1":
                saved = None
                if "delete" in body: SAVED.pop(body["delete"], None)
                elif not body.get("text", "").strip(): return self.send(400, json.dumps({"error": "Stub: no cards"}))
                elif body["name"] in SAVED and not body.get("replace"): return self.send(409, json.dumps({"error": "exists", "exists": body["name"]}))
                else:
                    x = data[0]["b"]["all"]["deck"][:8]
                    SAVED[body["name"]] = {"title": body["name"], "cmdr": [data[0]["name"]], "cidx": [data[0]["cidx"]], "ci": data[0]["ci"],
                                           "img": "", "own": 8, "total": 8, "pct": 100.0, "cards": [[e[0], 1, 1] for e in x], "gaps": [], "combos": None,
                                           "an": {"bf": {"est": 3, "why": ["1 Game Changer (B1-2 allow none)"]}, "gcn": [], "tut": 1,
                                                  "rd": [["ramp", 5, 10, False], ["draw", 12, 9, True]], "cmc": 3.1, "lands": 36,
                                                  "mv": [0, 5, 8, 9, 6, 3, 2, 1], "ty": {"Land": 36}, "ref": None, "adecks": 0,
                                                  "core": [["discard", 9]], "eng": [["discard", 7]], "add": [[x[0][0], -1]], "buy": [],
                                                  "cut": [[x[1][0], -1]], "combos_checked": True}}
                    saved = body["name"]
                return self.send(200, json.dumps({"decks": list(SAVED.values()), "saved": saved, "cards": [], "strs": [], "combos": [], "opts": []}))
            if self.path != "/pins" or self.headers.get("X-Deck-Wizard") != "1": return self.send(403, "{}")
            if "Nope Card" in body.get("in", []) + body.get("out", []):
                return self.send(400, json.dumps({"error": "Stub: not in your collection"}))
            self.send(200, json.dumps({"pins": {"in": sorted(set(body.get("in", []))), "out": sorted(set(body.get("out", [])))}}))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def browser():
    for b in BROWSERS:
        path = b if os.path.isabs(b) else shutil.which(b)
        if path and os.path.exists(path): return path
    return None

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "report.html"
    exe = browser()
    if not exe: sys.exit("No Edge/Chrome found.")
    html = open(src, encoding="utf-8").read()
    html = html.replace("<head>", "<head>" + CATCH, 1) if "<head>" in html else CATCH + html
    html = html[:html.rfind("</body>")] + PROBE + html[html.rfind("</body>"):] if "</body>" in html else html + PROBE
    # bigger reports need more time: every panel is rendered once and each frame of a long page takes longer
    # (15 s up to ~70 commanders, ~47 s for 288); the real-time limit grows with it
    n_cmdrs = html.count('"slug":')
    budget, limit = max(30000, 4000 + 150 * n_cmdrs), max(240, 60 + n_cmdrs)   # the check does more since F1-F4 (decks, counts)
    tmp, srv = tempfile.mkdtemp(prefix="dw_check_"), stub_server(html)
    try:
        cmd = [exe, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={os.path.join(tmp, 'profile')}",
               f"--virtual-time-budget={budget}", "--dump-dom", f"http://127.0.0.1:{srv.server_address[1]}/"]
        dom = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=limit).stdout
    finally:
        srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)
    m = re.search(r'<pre id="__test">(.*?)</pre>', dom, re.S)
    if not m: sys.exit("The page never finished loading (a script error before the probe?).")
    res = json.loads(m.group(1).replace("&quot;", '"').replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">"))
    print(f"{res['rows']} commander rows, {res['panels']} panels rendered, {res.get('clicks', 0)} clicks tested, {len(res['errs'])} errors")
    for e in res["errs"][:20]: print("  " + e)
    for e in res.get("notes") or []: print("  note: " + e)
    sys.exit(1 if res["errs"] or not res["panels"] else 0)

if __name__ == "__main__":
    main()
