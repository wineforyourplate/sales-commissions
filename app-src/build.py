"""Build the app: inline styles.css, being-shapes.js, core.js and app.js into one self-contained HTML file
at apps/sales-commissions/html.html. Run from anywhere: python3 app-src/build.py"""
import json
import os
import re
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
read = lambda n: open(os.path.join(HERE, n), encoding="utf-8").read()

core = read("core.js")
mark = re.search(r"api\.MARK = '(<svg.*?</svg>)';", core).group(1).replace('aria-hidden="true"', 'xmlns="http://www.w3.org/2000/svg"')
favicon = "data:image/svg+xml," + urllib.parse.quote(mark.replace('"', "'"), safe=" =:/,'")  # '#' and quotes must be escaped

out = (read("index.html")
       .replace("/*FAVICON*/", favicon)
       .replace("/*STYLES*/", read("styles.css"))
       .replace("/*BEING*/", read("being-shapes.js"))
       .replace("/*CORE*/", core)
       .replace("/*APP*/", read("app.js")))

d = os.path.join(ROOT, "apps", "sales-commissions")
os.makedirs(d, exist_ok=True)
open(os.path.join(d, "html.html"), "w", encoding="utf-8").write(out)
json.dump({
    "name": "sales-commissions",
    "description": "One app for the whole team: salespeople log deals and see their commission, finance approves and pays out, managers see everything and set the plan.",
    "public_slug": "sales-commissions",
    "visibility": "POD",
}, open(os.path.join(d, "sales-commissions.json"), "w"), indent=2)
print("apps/sales-commissions/html.html", len(out), "bytes")
