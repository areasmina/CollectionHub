#!/usr/bin/env python3
"""
Runs report.html in a headless browser (Edge or Chrome, already on Windows; no Node needed) and
renders every commander x bracket panel, catching JavaScript errors.

Usage:  py tests/check_report.py [report.html]
Exit code 0 = no errors.
"""
import json, os, re, shutil, subprocess, sys, tempfile

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "msedge", "google-chrome", "chromium", "chrome",
]

# runs before the page's own script: records uncaught errors
CATCH = "<script>window.__errs=[];window.addEventListener('error',e=>__errs.push('page: '+e.message));</script>"
# runs after it: renders every panel the user could open
PROBE = """<script>setTimeout(()=>{const out={panels:0,errs:window.__errs,rows:document.querySelectorAll('details.row').length};
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
// themes: every theme deck renders for every bracket; clicking a theme switches and clicking again returns
try{for(const d of DATA)for(const t of Object.keys(d.th||{}))for(const b of BR){if(!d.b[b])continue;
    const fake={dataset:{t,b}};const h=body(d,b,fake);if(!h||h.includes('undefined'))out.errs.push(d.name+' | '+b+' | '+t+': theme panel has "undefined"');out.panels++;}
  const d=DATA.find(d=>Object.keys(d.th||{}).length), r=d&&document.querySelector('details.row[data-i="'+d.i+'"]');
  if(r){r.open=true;rerow(r);const t=Object.keys(d.th)[0];
    r.querySelector('[data-tsel="'+t+'"]').click(); if(!r.querySelector('.thm.on'))out.errs.push('theme click did not select it');
    r.querySelector('.thm[data-tsel="'+t+'"]').click(); if(r.querySelector('.thm.on'))out.errs.push('second theme click did not go back');
    out.clicks=(out.clicks||0)+2;}}
catch(e){out.errs.push('themes: '+e.message);}
// average decks: every one renders; the switch selects it, a theme click leaves it, "Card stats" goes back
try{for(const d of DATA)for(const b of Object.keys(d.av||{})){const h=body(d,b,{dataset:{a:"1",b}});
    if(!h||h.includes('undefined'))out.errs.push(d.name+' | '+b+' | average deck: panel has "undefined"');out.panels++;}
  const d=DATA.find(d=>d.av&&d.av[bk()]), r=d&&document.querySelector('details.row[data-i="'+d.i+'"]');
  if(r){r.open=true;r.dataset.b=bk();rerow(r);
    r.querySelector('[data-asel="1"]').click(); if(!r.querySelector('.srcb.on[data-asel="1"]'))out.errs.push('average deck switch did not select it');
    if(!r.querySelector('.body').textContent.includes('average deck'))out.errs.push('average deck note missing');
    const t=r.querySelector('.thm'); if(t){t.click(); if(r.querySelector('.srcb.on[data-asel="1"]'))out.errs.push('theme click did not leave the average deck'); t.click();}
    r.querySelector('[data-asel="1"]').click(); r.querySelector('[data-asel="0"]').click();
    if(r.querySelector('.srcb.on[data-asel="1"]'))out.errs.push('card stats switch did not go back');
    out.clicks=(out.clicks||0)+4;}}
catch(e){out.errs.push('average decks: '+e.message);}
// page-wide source selector: "Average deck" switches the list and the panels, "Commander page" goes back
try{const tb=document.querySelector('[data-src="avg"]');
  if(!tb)out.errs.push('no Average deck selector at the top');
  else{tb.click(); if(!$('count').textContent.includes('average deck'))out.errs.push('top selector did not switch the list');
    const r=document.querySelector('details.row[data-i]');
    if(r){r.open=true; rerow(r); if(!r.querySelector('.srcb.on[data-asel="1"]'))out.errs.push('panel did not follow the top selector');
      if(!r.querySelector('.shape .mvc .rf'))out.errs.push('deck shape chart has no average-deck marker');}
    document.querySelector('[data-src=""]').click(); if($('count').textContent.includes('average deck'))out.errs.push('top selector did not go back');
    out.clicks=(out.clicks||0)+2;}}
catch(e){out.errs.push('top selector: '+e.message);}
// substitute chooser: open a slot, pick an alternative, then "buy", then reset
try{const b=bk(), d=DATA.find(d=>d.b[b]&&d.b[b].deck.some(e=>e[1]==='s'&&(e[4]||[]).length));
  const r=d&&document.querySelector('details.row[data-i="'+d.i+'"]');
  if(r){r.open=true;r.dataset.b=b;rerow(r);
    const e=d.b[b].deck.find(e=>e[1]==='s'&&(e[4]||[]).length), alt=e[4][0][0];
    r.querySelector('[data-swap="'+e[2]+'"]').click();
    if(!r.querySelector('.chooser'))out.errs.push('chooser did not open');
    r.querySelector('.opt[data-pick="'+alt+'"]').click();
    if(!r.querySelector('textarea').value.includes(front(alt)))out.errs.push('picked alternative not in the deck list');
    r.querySelector('[data-swap="'+e[2]+'"]').click(); r.querySelector('.opt[data-pick="-1"]').click();
    if(!(r.querySelector('.shop')||{}).textContent.includes(front(e[2])))out.errs.push('bought card not on the shopping list');
    r.querySelector('.reset-ch').click();
    if(Object.keys(getCh(d,b)).length)out.errs.push('reset did not clear choices');
    out.clicks=(out.clicks||0)+5;}
  else out.errs.push('no substitute with alternatives found to test');}
catch(e){out.errs.push('chooser: '+e.message);}
const p=document.createElement('pre');p.id='__test';p.textContent=JSON.stringify(out);document.body.appendChild(p);},500);</script>"""

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
    tmp = tempfile.mkdtemp(prefix="dw_check_")
    try:
        page = os.path.join(tmp, "report_check.html")
        with open(page, "w", encoding="utf-8") as f: f.write(html)
        cmd = [exe, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={os.path.join(tmp, 'profile')}",
               "--virtual-time-budget=15000", "--dump-dom", "file:///" + page.replace("\\", "/")]
        dom = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=180).stdout
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    m = re.search(r'<pre id="__test">(.*?)</pre>', dom, re.S)
    if not m: sys.exit("The page never finished loading (a script error before the probe?).")
    res = json.loads(m.group(1).replace("&quot;", '"').replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">"))
    print(f"{res['rows']} commander rows, {res['panels']} panels rendered, {res.get('clicks', 0)} clicks tested, {len(res['errs'])} errors")
    for e in res["errs"][:20]: print("  " + e)
    sys.exit(1 if res["errs"] or not res["panels"] else 0)

if __name__ == "__main__":
    main()
