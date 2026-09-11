// Junta os manifestos de todas as fontes num catálogo só, classifica as imagens
// do suporte pelo checklist de TELAS.md (por palavra-chave — é heurística, e o
// campo se chama `tela_auto` por isso) e gera:
//   catalogo.json   — tudo normalizado
//   COBERTURA.md    — matriz grupo de tela × plataforma, com as lacunas
//   index.html      — galeria local com filtros (abre direto do disco)
// Rodar de dentro de ferramentas/:  node consolidar.mjs
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const RAIZ = path.resolve("..");
const FONTES = ["suporte", "blog", "lojas", "publico", "desenvolvedores"];

// Regra → rótulo. Testadas contra título + cabeçalho + alt + legenda; o texto
// anterior só entra se nada casar, porque ele fala do passo seguinte com
// frequência e puxaria rótulos errados.
const REGRAS = [
  [/\bqr\b/, "autenticação > login por QR"],
  [/\blog ?in\b|\bsign(ing)? in\b/, "autenticação > login"],
  [/\bregist|sign(ing)? up|create (an |a new |your )?account/, "autenticação > registro"],
  [/forgot.*password|reset.*password|password reset|change (your )?password/, "autenticação > esqueci a senha"],
  [/two.factor|\b2fa\b|authenticator|backup code|security key|passkey/, "autenticação > 2FA"],
  [/verif(y|ied|ication)? (your )?(email|phone)|captcha/, "autenticação > verificação"],
  [/message request/, "home > pedidos de mensagem"],
  [/group (dm|chat|message)/, "home > DM em grupo"],
  [/friend/, "home > amigos (online/todos/pendentes/bloqueados/adicionar)"],
  [/direct message|\bdms?\b/, "home > DM 1:1"],
  [/server (list|folder|icon)|folders?\b/, "servidor > rail de servidores"],
  [/channel list|categor(y|ies)\b|sidebar/, "servidor > lista de canais"],
  [/member list|members list/, "servidor > lista de membros"],
  [/\bthreads?\b/, "servidor > thread"],
  [/\bforum/, "servidor > fórum"],
  [/announcement|follow(ing|ed)? channel/, "servidor > anúncios"],
  [/voice channel/, "servidor > canal de voz"],
  [/\bstages?\b/, "servidor > palco (stage)"],
  [/\bevents?\b/, "servidor > eventos"],
  [/onboarding/, "servidor > onboarding"],
  [/rules screening|membership screening|verification level|server rules/, "servidor > tela de regras/verificação"],
  [/channels (&|and) roles|server guide|browse channels/, "servidor > diretório/canais e cargos"],
  [/upload|attach/, "chat > upload/anexos"],
  [/emoji/, "chat > seletor de emoji"],
  [/\bgifs?\b/, "chat > seletor de GIF"],
  [/sticker/, "chat > figurinhas"],
  [/reaction/, "chat > reações/super reações"],
  [/\brepl(y|ies)\b/, "chat > resposta"],
  [/mention|@everyone|@here/, "chat > menções"],
  [/embed|link preview/, "chat > embeds"],
  [/edit(ing)? (a |your )?message/, "chat > edição"],
  [/message (menu|options)|right.click|context menu/, "chat > menu de contexto da mensagem"],
  [/\bpin(ned|s)?\b/, "chat > fixadas"],
  [/\bsearch/, "chat > busca"],
  [/inbox|unreads/, "chat > caixa de entrada (menções/não lidas)"],
  [/\bpolls?\b/, "chat > enquete"],
  [/soundboard/, "chat > soundboard"],
  [/markdown|formatting|spoiler|code block|chat ?bar|text box|message box/, "chat > composer"],
  [/screen ?shar|go live|\bstream(ing)?\b/, "voz e vídeo > compartilhar tela/Go Live"],
  [/video call|camera|\bvideo\b/, "voz e vídeo > câmera/grade"],
  [/activit(y|ies)/, "voz e vídeo > atividades"],
  [/overlay/, "voz e vídeo > overlay de jogo"],
  [/pop.?out|picture.in.picture|\bpip\b/, "voz e vídeo > janela flutuante/popout"],
  [/\bcalls?\b|ringing/, "voz e vídeo > chamada de DM (toque)"],
  [/voice (connected|panel|controls)|disconnect/, "voz e vídeo > painel de voz"],
  [/custom status/, "perfil > status personalizado"],
  [/\b(online )?status\b|\bidle\b|do not disturb|invisible/, "perfil > status/presença"],
  [/edit(ing)? (your )?profile|customi[sz]e.*profile|banner|avatar decoration|profile effect|nameplate|display name style/, "perfil > editar perfil"],
  [/\bprofile/, "perfil > perfil completo"],
  [/my account|username|display name|e-?mail address|phone number|delete (your )?account|disable (your )?account/, "configurações do usuário > minha conta"],
  [/privacy|safety setting|sensitive media|explicit (media|image|content)|dm spam|block(ed|ing)? user/, "configurações do usuário > privacidade e segurança"],
  [/\bdevices\b/, "configurações do usuário > dispositivos"],
  [/connection|connected account|spotify|twitch|youtube|steam|crunchyroll|battle\.net/, "configurações do usuário > conexões"],
  [/authori[sz]ed app/, "configurações do usuário > apps autorizados"],
  [/push notification/, "mobile > notificação push"],
  [/notification/, "configurações do usuário > notificações"],
  [/appearance|\btheme|dark mode|light mode|compact mode|message display|zoom level|font scal/, "configurações do usuário > aparência"],
  [/accessibility|reduced motion|saturation|screen reader|text.to.speech|\btts\b|contrast/, "configurações do usuário > acessibilidade"],
  [/voice (&|and) video|voice settings|noise suppression|krisp|echo cancel|input sensitivity|push to talk|microphone|headset/, "configurações do usuário > voz e vídeo"],
  [/text (&|and) images|chat settings/, "configurações do usuário > texto e imagens"],
  [/keybind|keyboard shortcut|hotkey/, "configurações do usuário > atalhos de teclado"],
  [/\blanguage/, "configurações do usuário > idioma"],
  [/streamer mode/, "configurações do usuário > modo streamer"],
  [/developer mode|advanced settings|hardware acceleration/, "configurações do usuário > avançado"],
  [/family center|teen/, "configurações do usuário > família/central"],
  [/\bboost/, "configurações do servidor > impulsos"],
  [/nitro|subscription|billing|payment|\bgift|refund/, "configurações do usuário > nitro/assinaturas/cobrança"],
  [/server settings|server overview|server name|server (icon|banner)/, "configurações do servidor > visão geral"],
  [/create (a )?role/, "modais > criar cargo"],
  [/\broles?\b/, "configurações do servidor > cargos"],
  [/widget/, "configurações do servidor > widget"],
  [/template/, "configurações do servidor > modelo"],
  [/\bban(s|ned|ning)?\b|\bkick/, "configurações do servidor > banimentos"],
  [/automod|auto.?moderation/, "configurações do servidor > automod"],
  [/audit log/, "configurações do servidor > registro de auditoria"],
  [/integration|webhook|\bbots?\b/, "configurações do servidor > integrações/bots/webhooks"],
  [/community server|enable community|community (settings|features)/, "configurações do servidor > comunidade"],
  [/server discovery|discoverable/, "configurações do servidor > descoberta"],
  [/delete (a |your |the )?server|transfer ownership/, "configurações do servidor > excluir servidor"],
  [/channel settings|channel permission|permission overrid|advanced permissions/, "configurações do canal > permissões"],
  [/create (a |your )?server|add a server/, "modais > criar servidor"],
  [/join (a )?server/, "modais > entrar em servidor"],
  [/invite/, "modais > gerar convite"],
  [/create (a )?channel/, "modais > criar canal"],
  [/quick ?switcher|ctrl ?\+ ?k|cmd ?\+ ?k/, "modais > troca rápida (Ctrl+K)"],
  [/app directory|app launcher|\bapps? (tab|button)/, "descoberta > diretório de apps"],
  [/\bquests?\b|\borbs?\b/, "descoberta > missões (quests)"],
  [/\bshop\b/, "descoberta > loja"],
  [/explore|discover servers/, "descoberta > descobrir servidores"],
  [/long.press|press and hold|tap and hold/, "mobile > menu de toque longo"],
  [/swipe|drawer/, "mobile > gavetas"],
  [/you tab|bottom (bar|nav|tab)/, "mobile > barra de abas"],
];

const REGRAS_EXTRAS = [
  [/popout|mini.?profile|profile card|user card/, "perfil > popout do usuário"],
  [/channel header|top of (the|your) (channel|screen)|toolbar/, "servidor > cabeçalho do canal"],
  [/edit(ing|ed)? (a |my |your |the )?messages?/, "chat > edição"],
  [/custom emoji|upload(ing)? (an? )?emoji|server emoji/, "configurações do servidor > emojis"],
  [/custom sticker|upload(ing)? (an? )?sticker|sticker creator/, "configurações do servidor > figurinhas"],
  [/adding.*sounds|managing sounds|upload(ing)? (a )?sound/, "configurações do servidor > soundboard"],
  [/boost (this|a|the|your) server|buy a level/, "modais > impulsionar"],
  [/create (a |new )?roles?/, "modais > criar cargo"],
  [/keyboard shortcut|\bshortcuts?\b|ctrl ?\+ ?\//, "modais > atalhos"],
  [/allow (access|discord)|permission prompt|(photo|camera|microphone) access/, "mobile > permissões do sistema"],
  [/are you sure|confirm(ation)? (modal|dialog|prompt)/, "modais > confirmação"],
  [/invite (link|landing|page)|accept (the |an )?invite/, "modais > página de convite"],
];

// Num artigo de configurações do servidor, "emoji" é a aba de emojis do
// servidor, não o seletor do chat. O mesmo vale para as demais abaixo.
const NO_SERVIDOR = {
  "chat > seletor de emoji": "configurações do servidor > emojis",
  "chat > figurinhas": "configurações do servidor > figurinhas",
  "chat > soundboard": "configurações do servidor > soundboard",
  "servidor > onboarding": ["servidor > onboarding", "configurações do servidor > onboarding"],
  "servidor > lista de membros": "configurações do servidor > membros",
  "modais > gerar convite": "configurações do servidor > convites",
};
const NA_CONTA = { "perfil > editar perfil": "configurações do usuário > perfis" };

function classificar(principal, secundario, categoria) {
  // Nome de arquivo no alt ("nitro.gif") casaria "gif" e afins.
  const limpar = (t) => t.toLowerCase().replace(/\S+\.(png|gif|jpe?g|webp|svg)\b/g, " ");
  const casar = (txt) => [...REGRAS, ...REGRAS_EXTRAS].filter(([re]) => re.test(txt)).map(([, r]) => r);
  let r = casar(limpar(principal));
  if (!r.length) r = casar(limpar(secundario));
  const troca = categoria === "Server Settings" ? NO_SERVIDOR : categoria === "Account Settings" ? NA_CONTA : {};
  r = r.flatMap((t) => troca[t] || t);
  return [...new Set(r)].slice(0, 4);
}

// Nenhum manifesto concorda 100% com o outro: cada fonte foi coletada por um
// agente diferente. A normalização fica aqui, num lugar só.
const PLATAFORMAS = {
  desktop: "desktop", web: "desktop", "desktop+web": "desktop", windows: "desktop", mac: "desktop",
  "web-mobile": "web-mobile", "web-mobile-ios": "web-mobile", "web-mobile-android": "web-mobile",
  ios: "ios", iphone: "ios", android: "android", "android-celular": "android",
  tablet: "tablet", ipad: "tablet", "android-tablet": "tablet", console: "console",
  mobile: "mobile", "provavel-mobile": "mobile", "ios+android": "mobile",
};
const normPlataforma = (p) => PLATAFORMAS[String(p || "").toLowerCase()] || "desconhecida";

// O suporte raramente diz a plataforma de cada imagem. Quando o texto não
// decide, o formato decide: celular é retrato, desktop é paisagem. Fica
// marcado como inferido para ninguém tomar por certo.
function plataformaSuporte(it) {
  const txt = it.plataforma_texto || [];
  const retrato = it.largura && it.altura ? it.altura / it.largura > 1.35 : null;
  if (txt.length === 1) {
    const p = txt[0] === "web" ? "desktop" : txt[0];
    return { plataforma: p, inferida: false };
  }
  if (txt.includes("console") && txt.length <= 2 && !retrato) return { plataforma: "console", inferida: true };
  if (retrato === true) {
    if (txt.includes("ios") && !txt.includes("android")) return { plataforma: "ios", inferida: true };
    if (txt.includes("android") && !txt.includes("ios")) return { plataforma: "android", inferida: true };
    return { plataforma: "mobile", inferida: !txt.includes("mobile") };
  }
  if (retrato === false) return { plataforma: "desktop", inferida: !txt.some((p) => p === "desktop" || p === "web") || txt.length > 1 };
  return { plataforma: "desconhecida", inferida: true };
}
const listaTelas = (t) => (Array.isArray(t) ? t : String(t || "").split(";")).map((s) => s.trim()).filter(Boolean);

const catalogo = [];
for (const fonte of FONTES) {
  const arq = path.join(RAIZ, fonte, "manifesto.json");
  if (!existsSync(arq)) { console.log(`(sem manifesto em ${fonte}/)`); continue; }
  const itens = JSON.parse(await readFile(arq, "utf8"));
  for (const it of itens) {
    if (!it.arquivo || it.duplicada_de_outro_artigo) continue;
    // O público salva o HTML renderizado ao lado de cada captura; galeria é só imagem.
    if (!/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(it.arquivo)) continue;
    const arquivo = path.join(fonte, it.arquivo);
    if (!existsSync(path.join(RAIZ, arquivo))) continue;
    let telas = listaTelas(it.tela);
    let auto = false;
    let plat = { plataforma: normPlataforma(it.plataforma || it.perfil || it.dispositivo), inferida: false };
    if (fonte === "suporte") {
      // Ícone solto no meio do texto (engrenagem, "+") é ruído na galeria.
      if (it.largura && it.altura && Math.min(it.largura, it.altura) < 100) continue;
      telas = classificar(
        [it.artigo, it.cabecalho, it.alt, it.legenda].join(" | "),
        [it.texto_anterior, it.secao].join(" | "),
        it.categoria,
      );
      auto = true;
      plat = plataformaSuporte(it);
    }
    catalogo.push({
      fonte, arquivo,
      plataforma: plat.plataforma, plataforma_inferida: plat.inferida,
      telas, tela_auto: auto,
      titulo: it.artigo || it.titulo_pagina || it.titulo || it.loja || it.url || "",
      contexto: [it.cabecalho, it.legenda || it.contexto, it.alt, it.texto_anterior, it.observacao].filter(Boolean).join(" · ").slice(0, 400),
      pagina: it.artigo_url || it.pagina_origem || it.url || null,
      data: it.data_publicacao || it.data_captura || it.atualizado_em || null,
      largura: it.largura ?? null, altura: it.altura ?? null,
      tema: it.tema || null,
    });
  }
}
await writeFile(path.join(RAIZ, "catalogo.json"), JSON.stringify(catalogo, null, 1));

// Cobertura: para cada rótulo do checklist, quantas imagens por plataforma.
const checklist = (await readFile(path.join(RAIZ, "TELAS.md"), "utf8"))
  .split("\n").filter((l) => l.startsWith("- ")).flatMap((l) => {
    const [grupo, resto] = l.slice(2).split(" > ");
    return resto.split(" | ").map((t) => `${grupo} > ${t.trim()}`);
  });
const COLS = ["desktop", "web-mobile", "ios", "android", "mobile", "tablet", "console", "desconhecida"];
const cont = new Map();
for (const c of catalogo) for (const t of c.telas) {
  const k = cont.get(t) || Object.fromEntries(COLS.map((x) => [x, 0]));
  k[c.plataforma]++;
  cont.set(t, k);
}
const porFonte = Object.fromEntries(FONTES.map((f) => [f, catalogo.filter((c) => c.fonte === f).length]));
const porPlat = Object.fromEntries(COLS.map((p) => [p, catalogo.filter((c) => c.plataforma === p).length]));
const linhas = [
  "# Cobertura das referências do Discord",
  "",
  `Gerado por \`ferramentas/consolidar.mjs\` em ${new Date().toISOString().slice(0, 10)}. Total: **${catalogo.length}** imagens únicas.`,
  "",
  "Por fonte: " + Object.entries(porFonte).map(([k, v]) => `${k} ${v}`).join(" · "),
  "",
  "Por plataforma: " + Object.entries(porPlat).map(([k, v]) => `${k} ${v}`).join(" · "),
  "",
  "`mobile` = é celular mas a fonte não diz se é iOS ou Android. As telas das imagens do suporte são",
  "classificadas por palavra-chave (`tela_auto`), então use a contagem como mapa, não como verdade.",
  "",
  `| Tela | ${COLS.join(" | ")} | total |`,
  `|---|${COLS.map(() => "---:").join("|")}|---:|`,
];
const lacunas = [];
for (const t of checklist) {
  const k = cont.get(t);
  const total = k ? COLS.reduce((s, x) => s + k[x], 0) : 0;
  if (!total) lacunas.push(t);
  linhas.push(`| ${t} | ${COLS.map((x) => (k?.[x] ? k[x] : "·")).join(" | ")} | ${total || "**0**"} |`);
}
const semChecklist = [...cont.keys()].filter((t) => !checklist.includes(t)).sort();
linhas.push("", `## Lacunas (${lacunas.length} telas sem nenhuma imagem)`, "", ...lacunas.map((t) => `- ${t}`));
if (semChecklist.length) linhas.push("", "## Rótulos fora do checklist (vindos das fontes)", "", ...semChecklist.map((t) => `- ${t} (${COLS.reduce((s, x) => s + cont.get(t)[x], 0)})`));
await writeFile(path.join(RAIZ, "COBERTURA.md"), linhas.join("\n") + "\n");

// Galeria: o JSON vai embutido porque fetch() de file:// é bloqueado.
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Referências do Discord</title>
<style>
:root{--bg:#1e1f22;--pn:#2b2d31;--tx:#dbdee1;--mu:#949ba4;--ac:#5865f2;--bd:#3f4147}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.4 system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--pn);border-bottom:1px solid var(--bd);padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
h1{font-size:16px;margin:0 12px 0 0}select,input{background:var(--bg);color:var(--tx);border:1px solid var(--bd);border-radius:6px;padding:6px 8px;font:inherit}
input{flex:1;min-width:180px}#n{color:var(--mu)}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;padding:16px}
.c{background:var(--pn);border:1px solid var(--bd);border-radius:8px;overflow:hidden;cursor:zoom-in;display:flex;flex-direction:column}
.c img{width:100%;height:180px;object-fit:contain;background:#111214}.c div{padding:8px;font-size:12px}
.t{color:var(--tx);font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.m{color:var(--mu);margin-top:4px}.tag{display:inline-block;background:var(--bg);border-radius:4px;padding:1px 6px;margin:2px 2px 0 0;color:var(--mu)}
dialog{max-width:96vw;max-height:96vh;background:var(--pn);color:var(--tx);border:1px solid var(--bd);border-radius:10px;padding:0}
dialog img{display:block;max-width:94vw;max-height:78vh;margin:auto}dialog section{padding:12px 16px;max-width:94vw}
dialog a{color:#00a8fc}::backdrop{background:#000c}
</style></head><body>
<header><h1>Referências do Discord</h1>
<select id="fonte"><option value="">todas as fontes</option></select>
<select id="plat"><option value="">todas as plataformas</option></select>
<select id="grupo"><option value="">todos os grupos</option></select>
<select id="tela"><option value="">todas as telas</option></select>
<input id="q" placeholder="buscar em título, contexto e tela…"><span id="n"></span></header>
<main id="g"></main><dialog id="d"></dialog>
<script>
const D=${JSON.stringify(catalogo)};
const $=s=>document.querySelector(s),esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const opts=(el,vals)=>vals.forEach(v=>el.insertAdjacentHTML("beforeend",\`<option>\${esc(v)}</option>\`));
const uniq=a=>[...new Set(a)].sort();
opts($("#fonte"),uniq(D.map(x=>x.fonte)));opts($("#plat"),uniq(D.map(x=>x.plataforma)));
opts($("#grupo"),uniq(D.flatMap(x=>x.telas.map(t=>t.split(" > ")[0]))));
function telas(){const g=$("#grupo").value;$("#tela").innerHTML='<option value="">todas as telas</option>';
 opts($("#tela"),uniq(D.flatMap(x=>x.telas)).filter(t=>!g||t.startsWith(g+" >")));}
telas();
function render(){const f=$("#fonte").value,p=$("#plat").value,g=$("#grupo").value,t=$("#tela").value,q=$("#q").value.toLowerCase();
 const r=D.filter(x=>(!f||x.fonte===f)&&(!p||x.plataforma===p)&&(!g||x.telas.some(s=>s.startsWith(g+" >")))&&(!t||x.telas.includes(t))
  &&(!q||(x.titulo+" "+x.contexto+" "+x.telas.join(" ")).toLowerCase().includes(q)));
 $("#n").textContent=r.length+" de "+D.length;
 $("#g").innerHTML=r.slice(0,1500).map(x=>\`<div class="c" data-i="\${D.indexOf(x)}"><img loading="lazy" src="\${esc(x.arquivo)}"><div>
  <div class="t">\${esc(x.titulo)}</div><div class="m">\${esc(x.fonte)} · \${esc(x.plataforma)}\${x.data?" · "+esc(x.data.slice(0,10)):""}</div>
  \${x.telas.map(s=>\`<span class="tag">\${esc(s.split(" > ")[1]||s)}</span>\`).join("")}</div></div>\`).join("");}
["#fonte","#plat","#tela"].forEach(s=>$(s).onchange=render);$("#grupo").onchange=()=>{telas();render()};$("#q").oninput=render;
$("#g").onclick=e=>{const c=e.target.closest(".c");if(!c)return;const x=D[c.dataset.i];
 $("#d").innerHTML=\`<img src="\${esc(x.arquivo)}"><section><b>\${esc(x.titulo)}</b><br><span class="m">\${esc(x.fonte)} · \${esc(x.plataforma)}\${x.largura?" · "+x.largura+"×"+x.altura:""}\${x.tela_auto?" · tela classificada automaticamente":""}</span>
 <p>\${esc(x.telas.join(" · "))}</p><p class="m">\${esc(x.contexto)}</p>\${x.pagina?\`<a href="\${esc(x.pagina)}" target="_blank" rel="noopener">página de origem</a> · \`:""}<a href="\${esc(x.arquivo)}" target="_blank">arquivo</a></section>\`;
 $("#d").showModal();};
$("#d").onclick=e=>{if(e.target.id==="d"||e.target.tagName==="IMG")$("#d").close()};
render();
</script></body></html>`;
await writeFile(path.join(RAIZ, "index.html"), html);
console.log(`catalogo=${catalogo.length}`, porFonte, porPlat, `lacunas=${lacunas.length}`);
