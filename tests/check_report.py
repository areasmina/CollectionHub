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
    print(f"{res['rows']} commander rows, {res['panels']} panels rendered, {len(res['errs'])} errors")
    for e in res["errs"][:20]: print("  " + e)
    sys.exit(1 if res["errs"] or not res["panels"] else 0)

if __name__ == "__main__":
    main()
