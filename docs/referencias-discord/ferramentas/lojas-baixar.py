"""Baixa imagens para lojas/imagens e acrescenta ao lojas/manifesto.json.

Uso: python3 lojas-baixar.py entradas.json
Cada entrada: campos do manifesto + "url_origem" + "arquivo" (relativo a lojas/).
Deduplica por SHA-1 contra tudo o que já está em lojas/imagens: se o conteúdo já
existe, não grava de novo e anexa a origem nova em "tambem_em" da entrada antiga.
"""
import hashlib, json, os, subprocess, sys, tempfile

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lojas")
MAN = os.path.join(BASE, "manifesto.json")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

def sha(p):
    return hashlib.sha1(open(p, "rb").read()).hexdigest()

man = json.load(open(MAN)) if os.path.exists(MAN) else []
porhash = {}
for e in man:
    p = os.path.join(BASE, e["arquivo"])
    if os.path.exists(p):
        porhash[sha(p)] = e

for ent in json.load(open(sys.argv[1])):
    fd, tmp = tempfile.mkstemp(); os.close(fd)
    r = subprocess.run(["curl", "-sfL", "-A", UA, "-o", tmp, ent["url_origem"]])
    if r.returncode != 0 or os.path.getsize(tmp) < 1000:
        print("FALHOU", ent["url_origem"]); os.remove(tmp); continue
    h = sha(tmp)
    if h in porhash:
        antiga = porhash[h]
        antiga.setdefault("tambem_em", []).append({"loja": ent["loja"], "pagina_origem": ent["pagina_origem"], "url_origem": ent["url_origem"]})
        print("DUPLICADA", ent["arquivo"], "=", antiga["arquivo"]); os.remove(tmp); continue
    dest = os.path.join(BASE, ent["arquivo"])
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    os.replace(tmp, dest)
    os.chmod(dest, 0o644)
    out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", dest], capture_output=True, text=True).stdout.split()
    ent["largura"] = int(out[out.index("pixelWidth:") + 1]); ent["altura"] = int(out[out.index("pixelHeight:") + 1])
    ent["sha1"] = h
    man.append(ent); porhash[h] = ent
    print("OK", ent["arquivo"], ent["largura"], "x", ent["altura"])

json.dump(man, open(MAN, "w"), ensure_ascii=False, indent=2)
print("total no manifesto:", len(man))
