# ADR-0007: Entrega contínua por GHCR e SSH de comando forçado

**Status:** Aceita (2026-08-28)
**Data:** 2026-08-28
**Decisores:** Arthur Miranda
**Escopo afetado:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`,
`docker-compose.ghcr.yml`, `scripts/deploy-streamz.sh`

## Contexto

O deploy era um humano com SSH aberto rodando `git pull` e `docker compose up -d
--build` no servidor. Três coisas doíam nisso:

1. **O build acontecia dentro da produção.** A imagem da web é um `next build`,
   e a máquina tem 6 vCPU dos quais 4 estão reservados por `cpuset` para o
   LiveKit (ADR-0005) — justamente porque jitter em SFU se ouve. Compilar ali no
   meio do dia disputa CPU com quem está em chamada.
2. **Não havia como voltar.** Sem imagem versionada, desfazer um deploy ruim
   significava outro build, de outro commit, com os mesmos minutos de espera.
3. **O que subia não era rastreável.** `up -d --build` produz uma imagem que
   existe só naquela máquina; ninguém consegue dizer depois qual commit gerou o
   contêiner que está rodando.

O CI já buildava as duas imagens a cada push — e as jogava fora, porque não
havia registro configurado. Metade do trabalho já estava paga.

## Opções consideradas

### A. Manter SSH e build no servidor, só automatizando o gatilho

**A favor:** nada novo para manter; o Actions só repete o que o humano fazia.
**Contra:** preserva os três problemas acima. Automatizar um deploy lento não o
torna rápido — torna-o lento sem supervisão.

### B. Runner self-hosted na máquina

**A favor:** nenhuma porta de entrada nova e nenhuma chave privada guardada no
GitHub; o runner fala de dentro para fora.
**Contra:** mais um serviço com credencial de longa duração para manter e
atualizar na caixa de produção, e o build continuaria acontecendo nela — o
problema principal seguiria de pé. Some-se que o runner tem acesso ao repositório
inteiro: comprometê-lo é pior do que comprometer a chave da opção C.

### C. CI publica no GHCR; o servidor só puxa, acionado por SSH travado

O `docker` job passa a publicar `ghcr.io/mirandasls/streamz-{api,web}` com tag
`sha-<7>`, e o deploy entra por SSH com uma chave que não abre shell: o
`authorized_keys` a prende a `/usr/local/bin/deploy-streamz` com `restrict`.

**Contra:** existe uma chave privada no GitHub, e o `NEXT_PUBLIC_*` sai do `.env`
da máquina para as *variables* do repositório — duas fontes de verdade a menos
no servidor, mas uma a mais fora dele.

## Decisão

**Opção C.** O deploy vira `pull` + `up -d`: segundos, sem compilar nada na
produção, com a imagem carimbada pelo commit que a gerou.

Quatro detalhes que sustentam a escolha:

- **A chave não dá shell.** `restrict,command="/usr/local/bin/deploy-streamz"`.
  O script recebe a tag em `SSH_ORIGINAL_COMMAND` e a valida contra
  `^(latest|sha-[0-9a-f]{7,40})$` antes de encostar no docker — sem isso a
  "tag" seria argumento arbitrário. Vazada, a chave reimplanta uma versão que já
  existe; não lê arquivo, não abre porta.
- **Nenhuma credencial de registro mora na máquina.** O token do GHCR é o
  `GITHUB_TOKEN` do job, que expira com ele, e chega pelo **stdin** — em
  argumento apareceria no `ps` de qualquer processo da máquina. Um `trap` faz
  `docker logout` na saída.
- **O servidor avança com `--ff-only`.** Se alguém editou algo à mão lá, o
  deploy para e diz isso, em vez de apagar o trabalho com um `reset --hard`.
  Foi assim que o patch do `zod` sobreviveu meses fora do git; a lição ficou.
- **A chave de host está fixada** em `DEPLOY_KNOWN_HOSTS`. Desligar o
  `StrictHostKeyChecking` entregaria o token do GHCR a qualquer coisa que
  respondesse naquele IP.

## Consequências

**Positivas**
- Produção não compila mais nada; o `cpuset` do LiveKit deixa de ser disputado.
- Rollback é reimplantar uma tag: `Deploy` → *Run workflow* → `sha-<antigo>`.
- Dá para responder "qual commit está rodando?" olhando a tag do contêiner.

**Negativas**
- **`NEXT_PUBLIC_*` mudou de dono.** Antes vinha do `.env` do servidor; agora das
  *variables* do repositório. Mexer no `.env` da máquina e reiniciar não muda
  mais o bundle — e nada avisa que as duas fontes divergiram.
- Uma chave privada com acesso à produção passa a viver nos secrets do GitHub.
  Mitigada pelo comando forçado, não eliminada.
- O deploy passa a depender de minutos do Actions e da disponibilidade do GHCR.
- A imagem não é assinada nem verificada: o servidor confia em quem tem push no
  registro. Suficiente para repositório privado de um dono; não para mais que
  isso.

## Quando reabrir

Se aparecer um segundo servidor (aí o certo é o servidor puxar sozinho, não o CI
empurrar para cada um), se as imagens precisarem de assinatura (`cosign`), ou se
o volume de builds estourar os minutos do Actions — nesse caso a opção B volta à
mesa, mas para *buildar*, não para deployar.
