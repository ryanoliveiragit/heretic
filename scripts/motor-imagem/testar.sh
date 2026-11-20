#!/bin/bash
# Uso: testar.sh <arquivo-req.json> <saida-prefixo>. Envia ao endpoint, espera, salva a imagem e o tempo cobrado.
K="$(cat '/home/ethical/.config/OpenBot/agent-api-keys/.vault/agent-93309c59-405f-4014-907c-1678704894c7/RUNPOD_API_KEY')"
EP=x139i6sjioxwt8
id=$(curl -sS -m 30 https://api.runpod.ai/v2/$EP/run -H "Authorization: Bearer $K" -H 'Content-Type: application/json' -d @"$1" | python3 -I -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
[ -z "$id" ] && { echo "falhou ao enfileirar"; exit 1; }
echo "job $id"
for i in $(seq 1 120); do
  sleep 10
  curl -sS -m 30 https://api.runpod.ai/v2/$EP/status/$id -H "Authorization: Bearer $K" -o "$2.status.json"
  st=$(python3 -I -c "import json; print(json.load(open('$2.status.json')).get('status'))")
  [ $((i % 3)) -eq 0 ] && echo "$((i*10))s: $st"
  case "$st" in COMPLETED|FAILED|CANCELLED|TIMED_OUT) break;; esac
done
python3 -I - "$2" <<'PY'
import json,sys,base64
p=sys.argv[1]; d=json.load(open(p+'.status.json'))
print('status', d.get('status'), '| espera na fila ms', d.get('delayTime'), '| execução ms', d.get('executionTime'))
o=d.get('output') or {}
imgs=o.get('images') or []
for i,im in enumerate(imgs):
    data=im.get('data') if isinstance(im,dict) else im
    open(f'{p}-{i}.png','wb').write(base64.b64decode(data)); print('salvou', f'{p}-{i}.png')
if d.get('status')!='COMPLETED': print(json.dumps(d)[:1500])
PY
