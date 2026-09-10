import type { Client, Guild } from "discord.js";
import {
  TIPO_INTEIRO,
  TIPO_TEXTO,
  type Comando,
  type Contexto,
} from "../runtime/tipos";
import { progressoDoXp, nivelDoXp, xpAcumuladoAte } from "./curva";
import { configPadrao, usuarioVazio, MULTIPLICADOR_MAXIMO, MULTIPLICADOR_MINIMO } from "./dados";
import {
  analisarAlvo,
  barraDeProgresso,
  escaparMarkdown,
  formatarNumero,
  medalha,
  truncar,
} from "./formatar";
import { cargosConquistados } from "./ganho";
import { ordenarRanking, paginar, posicaoNoRanking, POR_PAGINA } from "./ranking";
import {
  SEM_ROTA_DE_CARGOS,
  obterServico,
  podeGerenciarServidor,
  resolverCanal,
  resolverCargo,
  resolverMembro,
} from "./servico";

/**
 * **Tudo responde em texto, e nenhum comando manda embed.**
 *
 * Não é escolha de gosto: `POST /channels/:id/messages` da nossa API exige
 * `content` e recusa uma mensagem só com `embeds` — `50035
 * content[BASE_TYPE_REQUIRED]`. Uma resposta de embed puro vira erro no meio do
 * comando e o usuário não vê nada. A primeira execução desta prova morreu
 * exatamente assim: `/nivel`, `/ranking` e `/cargos-por-nivel` ficaram mudos
 * enquanto os comandos de texto respondiam.
 *
 * Texto formatado também é o que sobrevive melhor ao prefixo `!` e ao celular,
 * e é o que o bot de música faz nas respostas curtas (`formatar.ts`). Quando a
 * API aceitar embed sem `content`, isto aqui vira uma escolha de novo — hoje
 * não é.
 */

// ── Ajudantes ───────────────────────────────────────────────────────────────

/** Nível é coisa de servidor: em DM não há ranking nem cargo. */
async function servidorDe(ctx: Contexto): Promise<Guild | null> {
  if (!ctx.guildId) {
    await ctx.responder({ conteudo: "Só funciona dentro de um servidor.", efemera: true });
    return null;
  }
  const cliente = ctx.bot.cliente as Client<true>;
  const servidor = cliente.guilds.cache.get(ctx.guildId);
  if (!servidor) {
    await ctx.responder({ conteudo: "Não achei este servidor no meu cache.", efemera: true });
    return null;
  }
  return servidor;
}

/**
 * A porta dos comandos que mexem no XP dos outros.
 *
 * Recusa **efêmera**: quem não pode não precisa constranger-se no canal, e o
 * canal não precisa da recusa. No prefixo `!` a efêmera degrada para resposta
 * normal (é o contrato do runtime) — o que ainda é melhor que silêncio.
 */
async function exigeGerenciarServidor(ctx: Contexto, servidor: Guild): Promise<boolean> {
  if (await podeGerenciarServidor(servidor, ctx.usuarioId)) return true;
  await ctx.responder({
    conteudo: "Esse comando é de quem tem a permissão **Gerenciar servidor**.",
    efemera: true,
  });
  return false;
}

/**
 * O canal escrito como `#nome`.
 *
 * **Não** `<#id>`: o Streamz não tem menção de canal — o `@streamz/shared` só
 * conhece `<@&cargo>` e `@usuario`, e um `<#…>` sairia cru na tela. Com o canal
 * fora do cache, sobra o id, que ao menos é procurável.
 */
function canalVisivel(servidor: Guild, canalId: string): string {
  const canal = servidor.channels.cache.get(canalId);
  return canal ? `#${escaparMarkdown(truncar(canal.name, 40))}` : `canal ${canalId}`;
}

/** O nome de quem aparece numa linha, já escapado e cortado. */
function nomeVisivel(servidor: Guild, usuarioId: string): string {
  const membro = servidor.members.cache.get(usuarioId);
  const bruto = membro?.displayName ?? membro?.user.username ?? `usuário ${usuarioId.slice(0, 6)}…`;
  return escaparMarkdown(truncar(bruto, 32));
}

/** O alvo de um comando: quem foi pedido, ou quem chamou. */
async function alvoOuQuemChamou(
  ctx: Contexto,
  servidor: Guild,
  opcao: string,
): Promise<{ id: string; nome: string } | null> {
  const alvo = analisarAlvo(ctx.texto(opcao));
  if (!alvo) return { id: ctx.usuarioId, nome: nomeVisivel(servidor, ctx.usuarioId) };

  const membro = await resolverMembro(servidor, alvo);
  if (!membro) {
    await ctx.responder({
      conteudo: `Não achei **${escaparMarkdown(truncar(alvo.valor, 40))}** neste servidor. Vale o nome de usuário ou o id.`,
      efemera: true,
    });
    return null;
  }
  return { id: membro.id, nome: nomeVisivel(servidor, membro.id) };
}

// ── /nivel ──────────────────────────────────────────────────────────────────

const nivel: Comando = {
  nome: "nivel",
  descricao: "Mostra o nível, o XP e a posição de alguém no ranking do servidor",
  apelidos: ["xp", "rank"],
  opcoes: [
    {
      nome: "usuario",
      descricao: "de quem (nome de usuário ou id). Em branco: você",
      tipo: TIPO_TEXTO,
      restoDaLinha: true,
    },
  ],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;

    const alvo = await alvoOuQuemChamou(ctx, servidor, "usuario");
    if (!alvo) return;

    const estado = obterServico().estado(servidor.id);
    const usuario = estado.usuarios[alvo.id] ?? usuarioVazio();
    const p = progressoDoXp(usuario.xp);
    const ordenado = ordenarRanking(estado.usuarios);
    const posicao = posicaoNoRanking(ordenado, alvo.id);

    await ctx.responder(
      [
        `**Nível de ${alvo.nome}**`,
        `**Nível ${p.nivel}** — ${formatarNumero(p.xpNoNivel)} / ${formatarNumero(p.xpDoNivel)} XP`,
        `${barraDeProgresso(p.fracao)}  ${Math.floor(p.fracao * 100)}%`,
        `Faltam **${formatarNumero(p.falta)} XP** para o nível ${p.nivel + 1}.`,
        `XP total: **${formatarNumero(p.xp)}** · Posição: **${
          posicao > 0 ? `#${posicao} de ${ordenado.length}` : "ainda sem XP"
        }** · Mensagens: **${formatarNumero(usuario.mensagens)}**`,
      ].join("\n"),
    );
  },
};

// ── /ranking ────────────────────────────────────────────────────────────────

const ranking: Comando = {
  nome: "ranking",
  descricao: `Os ${POR_PAGINA} primeiros do servidor, por página`,
  apelidos: ["top", "niveis"],
  opcoes: [
    { nome: "pagina", descricao: "qual página (a 1 é o topo)", tipo: TIPO_INTEIRO },
  ],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;

    const estado = obterServico().estado(servidor.id);
    const ordenado = ordenarRanking(estado.usuarios);
    const pagina = paginar(ordenado, ctx.numero("pagina") ?? 1);

    if (pagina.total === 0) {
      await ctx.responder("Ninguém pontuou ainda por aqui. Comece a conversar.");
      return;
    }

    const linhas = pagina.itens.map((linha) => {
      const p = progressoDoXp(linha.xp);
      return (
        `${medalha(linha.posicao)} **${nomeVisivel(servidor, linha.usuarioId)}** — ` +
        `nível ${p.nivel} · ${formatarNumero(linha.xp)} XP`
      );
    });

    await ctx.responder(
      [
        `**Ranking de ${escaparMarkdown(truncar(servidor.name, 60))}**`,
        ...linhas,
        `_Página ${pagina.pagina} de ${pagina.paginas} · ${pagina.total} pessoa${pagina.total === 1 ? "" : "s"} com XP_`,
      ].join("\n"),
    );
  },
};

// ── /dar-xp e /tirar-xp ─────────────────────────────────────────────────────

/**
 * Os dois são o mesmo comando com o sinal trocado, e por isso saem da mesma
 * fábrica: duas cópias divergiriam na primeira correção (foi assim que um dos
 * dois ficaria sem a checagem de permissão).
 */
function comandoDeXp(sinal: 1 | -1): Comando {
  const dando = sinal > 0;
  return {
    nome: dando ? "dar-xp" : "tirar-xp",
    descricao: dando
      ? "Dá XP a alguém (só quem gerencia o servidor)"
      : "Tira XP de alguém (só quem gerencia o servidor)",
    opcoes: [
      { nome: "usuario", descricao: "de quem (nome de usuário ou id)", tipo: TIPO_TEXTO, obrigatoria: true },
      { nome: "quantidade", descricao: "quanto XP", tipo: TIPO_INTEIRO, obrigatoria: true },
    ],
    async executar(ctx) {
      const servidor = await servidorDe(ctx);
      if (!servidor) return;
      if (!(await exigeGerenciarServidor(ctx, servidor))) return;

      const alvoBruto = analisarAlvo(ctx.texto("usuario"));
      if (!alvoBruto) {
        await ctx.responder({ conteudo: "Diz de quem: `/dar-xp <usuário> <quantidade>`.", efemera: true });
        return;
      }
      const membro = await resolverMembro(servidor, alvoBruto);
      if (!membro) {
        await ctx.responder({
          conteudo: `Não achei **${escaparMarkdown(truncar(alvoBruto.valor, 40))}** neste servidor.`,
          efemera: true,
        });
        return;
      }

      const quantidade = ctx.numero("quantidade");
      if (quantidade === null || !Number.isFinite(quantidade) || quantidade <= 0) {
        await ctx.responder({ conteudo: "A quantidade tem de ser um número maior que zero.", efemera: true });
        return;
      }

      const servico = obterServico();
      const estado = servico.estado(servidor.id);
      const antes = estado.usuarios[membro.id] ?? usuarioVazio();
      const nivelAntes = nivelDoXp(antes.xp);
      const xp = Math.max(0, antes.xp + sinal * Math.floor(quantidade));
      estado.usuarios[membro.id] = { ...antes, xp };
      servico.loja.marcarSujo(servidor.id);

      const nivelDepois = nivelDoXp(xp);
      const nome = nomeVisivel(servidor, membro.id);
      const verbo = dando ? "ganhou" : "perdeu";
      let corpo =
        `**${nome}** ${verbo} **${formatarNumero(Math.floor(quantidade))} XP** — ` +
        `agora está no nível ${nivelDepois} com ${formatarNumero(xp)} XP.`;

      // Um `/dar-xp` grande pode pular vários níveis de uma vez; os cargos do
      // caminho todo valem, não só o do nível final (ver `cargosConquistados`).
      if (nivelDepois > nivelAntes) {
        const cargos = cargosConquistados(estado.config.cargosPorNivel, nivelAntes, nivelDepois);
        if (await servico.entregarCargos(servidor.id, membro.id, cargos)) {
          corpo += `\n${SEM_ROTA_DE_CARGOS}`;
        }
      }

      await ctx.responder(corpo);
    },
  };
}

// ── /zerar-niveis ───────────────────────────────────────────────────────────

/** A palavra que a pessoa precisa digitar. Maiúscula para não sair sem querer. */
const CONFIRMACAO = "CONFIRMAR";

const zerar: Comando = {
  nome: "zerar-niveis",
  descricao: "Apaga o XP de todo mundo neste servidor (exige confirmação)",
  opcoes: [
    {
      nome: "confirmacao",
      descricao: `digite ${CONFIRMACAO} para confirmar`,
      tipo: TIPO_TEXTO,
    },
  ],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    if (!(await exigeGerenciarServidor(ctx, servidor))) return;

    const servico = obterServico();
    const estado = servico.estado(servidor.id);
    const quantos = Object.keys(estado.usuarios).length;

    // A confirmação é obrigatória e **não** tem valor padrão: um comando que
    // apaga o ranking inteiro não pode funcionar por acidente de Enter.
    if ((ctx.texto("confirmacao") ?? "").trim() !== CONFIRMACAO) {
      await ctx.responder({
        conteudo:
          `Isso apaga o XP de **${formatarNumero(quantos)}** pessoa${quantos === 1 ? "" : "s"} ` +
          `e não dá para desfazer.\nSe é isso mesmo: \`/zerar-niveis ${CONFIRMACAO}\`.\n` +
          "_A configuração (anúncio, multiplicador, cargos por nível) não é apagada._",
        efemera: true,
      });
      return;
    }

    estado.usuarios = {};
    servico.loja.marcarSujo(servidor.id);
    await servico.loja.gravarPendentes();
    ctx.bot.log.aviso("níveis zerados", { servidor: servidor.id, por: ctx.usuarioId, quantos });
    await ctx.responder(
      `Pronto: o XP de **${formatarNumero(quantos)}** pessoa${quantos === 1 ? "" : "s"} foi apagado. ` +
        "A configuração continua como estava.",
    );
  },
};

// ── /configurar-niveis ──────────────────────────────────────────────────────

const configurar: Comando = {
  nome: "configurar-niveis",
  descricao: "Anúncio de subida, multiplicador de XP e canais ignorados",
  opcoes: [
    {
      nome: "ajuste",
      descricao: "o que mudar",
      tipo: TIPO_TEXTO,
      obrigatoria: true,
      escolhas: [
        { nome: "Ver a configuração", valor: "ver" },
        { nome: "Anunciar no canal onde a pessoa falou", valor: "anuncio-mesmo" },
        { nome: "Anunciar sempre num canal fixo", valor: "anuncio-canal" },
        { nome: "Não anunciar", valor: "anuncio-desligado" },
        { nome: "Multiplicador de XP", valor: "multiplicador" },
        { nome: "Ignorar um canal", valor: "ignorar-canal" },
        { nome: "Voltar a contar um canal", valor: "contar-canal" },
      ],
    },
    {
      nome: "valor",
      descricao: "o canal (nome ou id) ou o número do multiplicador",
      tipo: TIPO_TEXTO,
      restoDaLinha: true,
    },
  ],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;

    const ajuste = (ctx.texto("ajuste") ?? "ver").trim();
    if (ajuste !== "ver" && !(await exigeGerenciarServidor(ctx, servidor))) return;

    const servico = obterServico();
    const estado = servico.estado(servidor.id);
    const config = estado.config;
    const bruto = ctx.texto("valor");

    const canalPedido = (): string | null => {
      const alvo = analisarAlvo(bruto);
      return alvo ? resolverCanal(servidor, alvo) : null;
    };

    switch (ajuste) {
      case "anuncio-mesmo":
        config.anuncio = "mesmo";
        config.canalDeAnuncio = null;
        break;

      case "anuncio-canal": {
        const canal = canalPedido();
        if (!canal) {
          await ctx.responder({
            conteudo: "Diz qual canal: `/configurar-niveis anuncio-canal #geral` (nome ou id).",
            efemera: true,
          });
          return;
        }
        config.anuncio = "canal";
        config.canalDeAnuncio = canal;
        break;
      }

      case "anuncio-desligado":
        config.anuncio = "desligado";
        break;

      case "multiplicador": {
        const numero = Number((bruto ?? "").replace(",", "."));
        if (!Number.isFinite(numero) || numero < MULTIPLICADOR_MINIMO || numero > MULTIPLICADOR_MAXIMO) {
          await ctx.responder({
            conteudo: `O multiplicador vai de ${MULTIPLICADOR_MINIMO} a ${MULTIPLICADOR_MAXIMO}. Ex.: \`/configurar-niveis multiplicador 1.5\`.`,
            efemera: true,
          });
          return;
        }
        config.multiplicador = numero;
        break;
      }

      case "ignorar-canal": {
        const canal = canalPedido();
        if (!canal) {
          await ctx.responder({ conteudo: "Diz qual canal ignorar (nome ou id).", efemera: true });
          return;
        }
        if (!config.canaisIgnorados.includes(canal)) config.canaisIgnorados.push(canal);
        break;
      }

      case "contar-canal": {
        const canal = canalPedido();
        if (!canal) {
          await ctx.responder({ conteudo: "Diz qual canal voltar a contar (nome ou id).", efemera: true });
          return;
        }
        config.canaisIgnorados = config.canaisIgnorados.filter((c) => c !== canal);
        break;
      }

      case "ver":
        break;

      default:
        await ctx.responder({
          conteudo: "Não conheço esse ajuste. Use o `/` para ver a lista.",
          efemera: true,
        });
        return;
    }

    if (ajuste !== "ver") {
      servico.loja.marcarSujo(servidor.id);
      await servico.loja.gravarPendentes();
    }

    const padrao = configPadrao();
    const ondeAnuncia =
      config.anuncio === "desligado"
        ? "desligado"
        : config.anuncio === "canal"
          ? `sempre em ${canalVisivel(servidor, config.canalDeAnuncio!)}`
          : "no canal onde a pessoa falou";
    const ignorados =
      config.canaisIgnorados.length === 0
        ? "nenhum"
        : config.canaisIgnorados.map((c) => canalVisivel(servidor, c)).join(", ");

    await ctx.responder(
      [
        `**${ajuste === "ver" ? "Configuração dos níveis" : "Configuração salva"}**`,
        `Anúncio de subida: **${ondeAnuncia}**`,
        `Multiplicador de XP: **${config.multiplicador}×**${config.multiplicador === padrao.multiplicador ? " (padrão)" : ""}`,
        `Canais ignorados: ${ignorados}`,
        `Cargos por nível: ${
          config.cargosPorNivel.length === 0
            ? "nenhum — veja `/cargo-por-nivel`"
            : config.cargosPorNivel.map((c) => `nível ${c.nivel}`).join(", ")
        }`,
      ].join("\n"),
    );
  },
};

// ── Cargos por nível ────────────────────────────────────────────────────────

const cargoPorNivel: Comando = {
  nome: "cargo-por-nivel",
  descricao: "Dá um cargo a quem alcançar um nível (só quem gerencia o servidor)",
  opcoes: [
    { nome: "nivel", descricao: "a partir de qual nível", tipo: TIPO_INTEIRO, obrigatoria: true },
    { nome: "cargo", descricao: "o cargo (nome ou id)", tipo: TIPO_TEXTO, obrigatoria: true, restoDaLinha: true },
  ],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    if (!(await exigeGerenciarServidor(ctx, servidor))) return;

    const numero = ctx.numero("nivel");
    if (numero === null || !Number.isFinite(numero) || numero < 1) {
      await ctx.responder({ conteudo: "O nível tem de ser 1 ou mais.", efemera: true });
      return;
    }
    const alvo = analisarAlvo(ctx.texto("cargo"));
    const cargo = alvo ? resolverCargo(servidor, alvo) : null;
    if (!cargo) {
      await ctx.responder({
        conteudo: "Não achei esse cargo. Vale o nome exato ou o id — veja em Configurações do servidor › Cargos.",
        efemera: true,
      });
      return;
    }

    const servico = obterServico();
    const config = servico.estado(servidor.id).config;
    const alvoNivel = Math.floor(numero);
    config.cargosPorNivel = [
      ...config.cargosPorNivel.filter((c) => c.nivel !== alvoNivel),
      { nivel: alvoNivel, cargoId: cargo.id },
    ].sort((a, b) => a.nivel - b.nivel);
    servico.loja.marcarSujo(servidor.id);
    await servico.loja.gravarPendentes();

    await ctx.responder(
      `Combinado: quem chegar ao **nível ${alvoNivel}** (${formatarNumero(xpAcumuladoAte(alvoNivel))} XP) ` +
        `ganha o cargo **${escaparMarkdown(truncar(cargo.name, 40))}**.\n${SEM_ROTA_DE_CARGOS}`,
    );
  },
};

const cargosPorNivel: Comando = {
  nome: "cargos-por-nivel",
  descricao: "Lista os cargos entregues por nível neste servidor",
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;

    const config = obterServico().estado(servidor.id).config;
    if (config.cargosPorNivel.length === 0) {
      await ctx.responder("Nenhum cargo por nível configurado. Use `/cargo-por-nivel <nível> <cargo>`.");
      return;
    }

    const linhas = config.cargosPorNivel.map((c) => {
      const cargo = servidor.roles.cache.get(c.cargoId);
      const nome = cargo ? escaparMarkdown(truncar(cargo.name, 40)) : `_cargo apagado (${c.cargoId})_`;
      return `**Nível ${c.nivel}** — ${nome}  ·  ${formatarNumero(xpAcumuladoAte(c.nivel))} XP`;
    });

    await ctx.responder(["**Cargos por nível**", ...linhas, SEM_ROTA_DE_CARGOS].join("\n"));
  },
};

const removerCargoPorNivel: Comando = {
  nome: "remover-cargo-por-nivel",
  descricao: "Tira o cargo configurado para um nível (só quem gerencia o servidor)",
  opcoes: [{ nome: "nivel", descricao: "qual nível", tipo: TIPO_INTEIRO, obrigatoria: true }],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    if (!(await exigeGerenciarServidor(ctx, servidor))) return;

    const numero = ctx.numero("nivel");
    if (numero === null || !Number.isFinite(numero)) {
      await ctx.responder({ conteudo: "Diz qual nível: `/remover-cargo-por-nivel 5`.", efemera: true });
      return;
    }
    const alvoNivel = Math.floor(numero);

    const servico = obterServico();
    const config = servico.estado(servidor.id).config;
    const antes = config.cargosPorNivel.length;
    config.cargosPorNivel = config.cargosPorNivel.filter((c) => c.nivel !== alvoNivel);
    if (config.cargosPorNivel.length === antes) {
      await ctx.responder({ conteudo: `Não havia cargo configurado para o nível ${alvoNivel}.`, efemera: true });
      return;
    }
    servico.loja.marcarSujo(servidor.id);
    await servico.loja.gravarPendentes();

    // Tirar o cargo de quem já o recebeu ficaria a cargo de quem administra: o
    // bot não sabe se o cargo foi dado por ele ou à mão, e remover um cargo que
    // alguém ganhou de outro jeito seria pior que deixar.
    await ctx.responder(
      `Removido: o nível ${alvoNivel} não dá mais cargo. Quem já recebeu continua com ele.`,
    );
  },
};

export const COMANDOS: Comando[] = [
  nivel,
  ranking,
  comandoDeXp(1),
  comandoDeXp(-1),
  zerar,
  configurar,
  cargoPorNivel,
  cargosPorNivel,
  removerCargoPorNivel,
];
