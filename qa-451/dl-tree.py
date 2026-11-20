#!/usr/bin/env python3
# Baixa a arvore exata do deploy atual (producao) para /tmp/opencode/deploy-nome-451
import json, base64, subprocess, sys, os

DPL = "dpl_GXBTN9aYgaqBHhnmFZAsAwphfvTB"
SCOPE = "dwadwdwas-projects"
OUT = "/tmp/opencode/deploy-nome-451"

def api(path):
    r = subprocess.run(["vercel", "api", path, "--method", "GET", "--scope", SCOPE],
                       capture_output=True, text=True, cwd="/tmp")
    if r.returncode != 0:
        print("ERRO:", r.stderr[:300]); sys.exit(1)
    return json.loads(r.stdout)

tree = api(f"/v8/deployments/{DPL}/files")

paths = []
def walk(nodes, prefix):
    for n in nodes:
        p = prefix + "/" + n["name"]
        if n["type"] == "file":
            paths.append((p, n["uid"]))
        else:
            walk(n.get("children", []), p)
walk(tree, "")
print("arquivos:", len(paths))

os.makedirs(OUT, exist_ok=True)
for i, (p, uid) in enumerate(paths):
    dest = os.path.join(OUT, p.lstrip("/"))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    d = api(f"/v8/deployments/{DPL}/files/{uid}")
    with open(dest, "wb") as f:
        f.write(base64.b64decode(d["data"]))
    if (i + 1) % 25 == 0:
        print(i + 1, "/", len(paths))
print("ok, arvore em", OUT)
