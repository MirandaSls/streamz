/**
 * Os comandos do **Streamz Boas-vindas**.
 *
 * ## Por que `acao` é uma opção com escolhas, e não um subcomando
 *
 * O desenho natural seria `/boas-vindas canal`, `/boas-vindas mensagem`, … como
 * subcomandos. Não dá: a casca de compatibilidade **recusa** subcomando e grupo
 * de subcomando (tipos 1 e 2) no `PUT` de registro, com 50035 — está no §9 do
 * `docs/BOTS-COMPATIVEIS-COM-O-DISCORD.md` e no cabeçalho de
 * `src/runtime/tipos.ts`, que por isso só declara os sete tipos de opção
 * aceitos. Um comando que aparece no composer e não funciona é pior que um que
 * não sobe.
 *
 * Então `acao` é uma opção de texto com `escolhas`: no `/` a pessoa escolhe da
 * lista, e no prefixo `!boas-vindas canal #geral` a primeira palavra é a ação —
 * exatamente o que a pessoa digitaria se fossem subcomandos de verdade.
 *
 * ## Por que as opções de canal e cargo são texto
 *
 * Ver o cabeçalho de `alvos.ts`: o `Contexto` do runtime só expõe `texto()` e
 * `numero()`, e uma opção `TIPO_CANAL` faria o `getString` do discord.js lançar.
 */

import { PermissionFlagsBits, type Client, type Guild, type GuildMember } from "discord.js";
import { TIPO_TEXTO, type Comando, type Contexto } from "../runtime/tipos";
import { acharPorIdOuNome, idDeCanal, idDeCargo } from "./alvos";
import { MAX_MODELO, validarModelo, type Configuracao } from "./configuracao";
import { VARIAVEIS } from "./mensagem";
import { obterServico, type Relato, type Resultado } from "./servico";

// ── ajudantes ───────────────────────────────────────────────

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
 * Quem configura precisa de **gerenciar servidor**; os outros levam uma recusa
 * efêmera.
 *
 * Efêmera porque a recusa é entre o bot e quem tentou: anunciar no canal que
 * fulano tentou mexer na configuração não ajuda ninguém e constrange à toa.
 * (No prefixo `!` a efêmera degrada para uma resposta citada — o runtime cuida
 * disso, e é melhor que engolir a resposta.)
 *
 * `permissions.has` já resolve dono do servidor e `ADMINISTRATOR` sozinho: o
 * bitfield que a nossa API manda é traduzido para o do Discord
 * (`packages/shared/src/permissoes-discord.ts`), e o `PermissionsBitField` do
 * discord.js faz a expansão do administrador.
 */
async function quemConfigura(ctx: Contexto, servidor: Guild): Promise<GuildMember | null> {
  const membro =
    servidor.members.cache.get(ctx.usuarioId) ??
    (await servidor.members.fetch(ctx.usuarioId).catch(() => null));
  if (!membro) {
    await ctx.responder({ conteudo: "Não consegui te achar neste servidor.", efemera: true });
    return null;
  }
  if (!membro.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await ctx.responder({
      conteudo: "Só quem pode **gerenciar o servidor** configura as boas-vindas.",
      efemera: true,
    });
    return null;
  }
  return membro;
}

function listaDeVariaveis(): string {
  return VARIAVEIS.map((v) => `\`{${v}}\``).join(", ");
}

function nomeDoCanal(servidor: Guild, id: string | null): string {
  if (!id) return "_nenhum_";
  const canal = servidor.channels.cache.get(id);
  return canal ? `#${canal.name}` : `_canal apagado (${id})_`;
}

function nomeDoCargo(servidor: Guild, id: string | null): string {
  if (!id) return "_nenhum_";
  const cargo = servidor.roles.cache.get(id);
  return cargo ? `@${cargo.name}` : `_cargo apagado (${id})_`;
}

function frase(resultado: Resultado, quando: string): string {
  if (resultado.estado === "desligado") return `${quando}: desligado`;
  if (resultado.estado === "ok") {
    return `${quando}: **ok**${resultado.detalhe ? ` (${resultado.detalhe})` : ""}`;
  }
  return `${quando}: **falhou** — ${resultado.detalhe}`;
}

function relatorio(relato: Relato): string {
  return [
    frase(relato.canal, "mensagem no canal"),
    frase(relato.dm, "mensagem por DM"),
    frase(relato.autorole, "cargo automático"),
  ]
    .map((l) => `• ${l}`)
    .join("\n");
}

/**
 * A configuração inteira, em **texto** e não num embed.
 *
 * Um embed seria mais bonito no `/`, e não funciona no `!`: a resposta do
 * prefixo é um `message.reply`, e o `POST /channels/:id/messages` da casca
 * recusa mensagem sem `content` (`50035 content[BASE_TYPE_REQUIRED]`). Um
 * comando que responde num caminho e estoura no outro é pior que um comando
 * sem embed — e foi exatamente o que a primeira execução da prova pegou.
 */
function textoDaConfiguracao(servidor: Guild, c: Configuracao): string {
  const linhas = [
    "**Boas-vindas — configuração atual**",
    c.entrada.ligado
      ? `• **Entrada:** ligada em ${nomeDoCanal(servidor, c.entrada.canalId)}\n> ${c.entrada.mensagem}`
      : "• **Entrada:** desligada",
    c.saida.ligado
      ? `• **Saída:** ligada em ${nomeDoCanal(servidor, c.saida.canalId)}\n> ${c.saida.mensagem}`
      : "• **Saída:** desligada",
    c.entrada.dm ? `• **DM:** ligada\n> ${c.entrada.mensagemDm}` : "• **DM:** desligada",
    c.autorole.ligado
      ? `• **Cargo automático:** ${nomeDoCargo(servidor, c.autorole.cargoId)}`
      : "• **Cargo automático:** desligado",
    `Variáveis: ${listaDeVariaveis()}.`,
  ];
  return linhas.join("\n");
}

const ESCOLHAS_ENTRADA = [
  { nome: "canal", valor: "canal" },
  { nome: "mensagem", valor: "mensagem" },
  { nome: "dm", valor: "dm" },
  { nome: "ver", valor: "ver" },
  { nome: "testar", valor: "testar" },
  { nome: "desligar", valor: "desligar" },
];

const ESCOLHAS_SAIDA = [
  { nome: "canal", valor: "canal" },
  { nome: "mensagem", valor: "mensagem" },
  { nome: "desligar", valor: "desligar" },
];

/** A opção que recebe o canal, a mensagem ou nada — sempre a última, e engolindo a linha. */
const OPCAO_VALOR = {
  nome: "valor",
  descricao: "o canal (#geral) ou o texto da mensagem, conforme a ação",
  tipo: TIPO_TEXTO,
  restoDaLinha: true,
} as const;

// ── /boas-vindas ────────────────────────────────────────────

const boasVindas: Comando = {
  nome: "boas-vindas",
  descricao: "Configura a mensagem de quem chega no servidor",
  apelidos: ["bv", "boasvindas"],
  opcoes: [
    {
      nome: "acao",
      descricao: "canal, mensagem, dm, ver, testar ou desligar",
      tipo: TIPO_TEXTO,
      obrigatoria: true,
      escolhas: ESCOLHAS_ENTRADA,
    },
    OPCAO_VALOR,
  ],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    if (!(await quemConfigura(ctx, servidor))) return;

    const acao = (ctx.texto("acao") ?? "").trim().toLowerCase();
    const valor = ctx.texto("valor");
    const servico = obterServico();

    switch (acao) {
      case "canal": {
        const canal = acharPorIdOuNome(servidor.channels.cache.values(), valor ?? "", idDeCanal);
        if (!canal || !canal.isTextBased()) {
          await ctx.responder({
            conteudo: "Não achei esse canal de texto. Tenta `#nome` ou o id.",
            efemera: true,
          });
          return;
        }
        const nova = await servico.atualizar(servidor.id, (atual) => ({
          ...atual,
          entrada: { ...atual.entrada, canalId: canal.id, ligado: true },
        }));
        await ctx.responder({
          conteudo:
            `Boas-vindas ligadas em ${nomeDoCanal(servidor, nova.entrada.canalId)}.\n` +
            `Mensagem atual:\n> ${nova.entrada.mensagem}`,
          efemera: true,
        });
        return;
      }

      case "mensagem": {
        const veredito = validarModelo(valor);
        if (!veredito.ok) {
          await ctx.responder({ conteudo: veredito.motivo, efemera: true });
          return;
        }
        const nova = await servico.atualizar(servidor.id, (atual) => ({
          ...atual,
          entrada: { ...atual.entrada, mensagem: veredito.texto },
        }));
        await ctx.responder({
          conteudo:
            `Mensagem de boas-vindas guardada.\n> ${nova.entrada.mensagem}\n` +
            (nova.entrada.ligado
              ? `Vai para ${nomeDoCanal(servidor, nova.entrada.canalId)}.`
              : "Falta escolher o canal: `/boas-vindas canal #algum`.") +
            `\nVariáveis: ${listaDeVariaveis()}.`,
          efemera: true,
        });
        return;
      }

      case "dm": {
        // Sem valor, alterna; com `ligar`/`desligar`, obedece. É a forma que não
        // obriga a decorar um "true".
        const pedido = (valor ?? "").trim().toLowerCase();
        const nova = await servico.atualizar(servidor.id, (atual) => ({
          ...atual,
          entrada: {
            ...atual.entrada,
            dm:
              pedido === "ligar"
                ? true
                : pedido === "desligar"
                  ? false
                  : !atual.entrada.dm,
          },
        }));
        await ctx.responder({
          conteudo: nova.entrada.dm
            ? `Mensagem por DM **ligada**.\n> ${nova.entrada.mensagemDm}`
            : "Mensagem por DM **desligada**.",
          efemera: true,
        });
        return;
      }

      case "ver": {
        const config = await servico.ler(servidor.id);
        await ctx.responder({ conteudo: textoDaConfiguracao(servidor, config), efemera: true });
        return;
      }

      case "testar": {
        const membro =
          servidor.members.cache.get(ctx.usuarioId) ??
          (await servidor.members.fetch(ctx.usuarioId).catch(() => null));
        if (!membro) {
          await ctx.responder({ conteudo: "Não consegui te achar neste servidor.", efemera: true });
          return;
        }
        // O mesmo caminho da entrada de verdade (ver `ServicoDeBoasVindas.receber`).
        await ctx.pensando(true);
        const relato = await servico.receber(membro);
        await ctx.responder({
          conteudo: `Disparei como se você tivesse acabado de entrar:\n${relatorio(relato)}`,
          efemera: true,
        });
        return;
      }

      case "desligar": {
        await servico.atualizar(servidor.id, (atual) => ({
          ...atual,
          entrada: { ...atual.entrada, ligado: false, dm: false },
        }));
        await ctx.responder({
          conteudo:
            "Boas-vindas desligadas. O canal e a mensagem ficam guardados — " +
            "`/boas-vindas canal` religa.",
          efemera: true,
        });
        return;
      }

      default:
        await ctx.responder({
          conteudo: `Ações: ${ESCOLHAS_ENTRADA.map((e) => `\`${e.valor}\``).join(", ")}.`,
          efemera: true,
        });
    }
  },
};

// ── /saida ──────────────────────────────────────────────────

const saida: Comando = {
  nome: "saida",
  descricao: "Configura a mensagem de quem sai do servidor",
  apelidos: ["saída", "tchau"],
  opcoes: [
    {
      nome: "acao",
      descricao: "canal, mensagem ou desligar",
      tipo: TIPO_TEXTO,
      obrigatoria: true,
      escolhas: ESCOLHAS_SAIDA,
    },
    OPCAO_VALOR,
  ],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    if (!(await quemConfigura(ctx, servidor))) return;

    const acao = (ctx.texto("acao") ?? "").trim().toLowerCase();
    const valor = ctx.texto("valor");
    const servico = obterServico();

    switch (acao) {
      case "canal": {
        const canal = acharPorIdOuNome(servidor.channels.cache.values(), valor ?? "", idDeCanal);
        if (!canal || !canal.isTextBased()) {
          await ctx.responder({
            conteudo: "Não achei esse canal de texto. Tenta `#nome` ou o id.",
            efemera: true,
          });
          return;
        }
        const nova = await servico.atualizar(servidor.id, (atual) => ({
          ...atual,
          saida: { ...atual.saida, canalId: canal.id, ligado: true },
        }));
        await ctx.responder({
          conteudo:
            `Mensagem de saída ligada em ${nomeDoCanal(servidor, nova.saida.canalId)}.\n` +
            `> ${nova.saida.mensagem}`,
          efemera: true,
        });
        return;
      }

      case "mensagem": {
        const veredito = validarModelo(valor);
        if (!veredito.ok) {
          await ctx.responder({ conteudo: veredito.motivo, efemera: true });
          return;
        }
        const nova = await servico.atualizar(servidor.id, (atual) => ({
          ...atual,
          saida: { ...atual.saida, mensagem: veredito.texto },
        }));
        await ctx.responder({
          conteudo:
            `Mensagem de saída guardada.\n> ${nova.saida.mensagem}\n` +
            (nova.saida.ligado
              ? `Vai para ${nomeDoCanal(servidor, nova.saida.canalId)}.`
              : "Falta escolher o canal: `/saida canal #algum`.") +
            `\nVariáveis: ${listaDeVariaveis()}.`,
          efemera: true,
        });
        return;
      }

      case "desligar": {
        await servico.atualizar(servidor.id, (atual) => ({
          ...atual,
          saida: { ...atual.saida, ligado: false },
        }));
        await ctx.responder({ conteudo: "Mensagem de saída desligada.", efemera: true });
        return;
      }

      default:
        await ctx.responder({
          conteudo: `Ações: ${ESCOLHAS_SAIDA.map((e) => `\`${e.valor}\``).join(", ")}.`,
          efemera: true,
        });
    }
  },
};

// ── /autorole ───────────────────────────────────────────────

const autorole: Comando = {
  nome: "autorole",
  descricao: "Cargo dado automaticamente a quem entra (ou `desligar`)",
  apelidos: ["cargo-automatico"],
  opcoes: [
    {
      nome: "cargo",
      descricao: "o cargo (@nome ou id), ou a palavra desligar",
      tipo: TIPO_TEXTO,
      obrigatoria: true,
      restoDaLinha: true,
    },
  ],
  async executar(ctx) {
    const servidor = await servidorDe(ctx);
    if (!servidor) return;
    if (!(await quemConfigura(ctx, servidor))) return;

    const pedido = (ctx.texto("cargo") ?? "").trim();
    const servico = obterServico();

    if (pedido.toLowerCase() === "desligar") {
      await servico.atualizar(servidor.id, (atual) => ({
        ...atual,
        autorole: { ...atual.autorole, ligado: false },
      }));
      await ctx.responder({ conteudo: "Cargo automático desligado.", efemera: true });
      return;
    }

    const cargo = acharPorIdOuNome(servidor.roles.cache.values(), pedido, idDeCargo);
    if (!cargo) {
      await ctx.responder({
        conteudo: "Não achei esse cargo. Tenta `@nome` ou o id — ou `desligar`.",
        efemera: true,
      });
      return;
    }
    // O `@everyone` já é de todo mundo; ligar o autorole nele não faria nada e
    // deixaria a configuração mentindo.
    if (cargo.id === servidor.id) {
      await ctx.responder({
        conteudo: "O `@everyone` já é de todo mundo — escolhe outro cargo.",
        efemera: true,
      });
      return;
    }

    const nova = await servico.atualizar(servidor.id, (atual) => ({
      ...atual,
      autorole: { ligado: true, cargoId: cargo.id },
    }));
    await ctx.responder({
      conteudo:
        `Quem entrar recebe ${nomeDoCargo(servidor, nova.autorole.cargoId)}.\n` +
        "Eu preciso de **gerenciar cargos** e de estar acima dele na lista.",
      efemera: true,
    });
  },
};

export const COMANDOS: Comando[] = [boasVindas, saida, autorole];

/** Exportado para o teste de identidade não repetir o número mágico. */
export const LIMITE_DO_MODELO = MAX_MODELO;
