package main

import (
	"context"
	"log/slog"
)

// ── Lote A1 (cripto + UDP) preenche. ──
//
// Uma porta só, `7883/udp`, para todas as sessões — como o Discord faz. A
// multiplexação é por SSRC, que nós atribuímos no `READY` (§D5.4). O primeiro
// pacote de uma sessão é o de descoberta de IP; a partir dele o endereço de
// origem fica amarrado ao SSRC (`SessaoDeVoz.FixarOrigem`).
//
// Pacote com SSRC desconhecido, ou com o SSRC certo vindo de outro endereço:
// **descartado em silêncio**. Uma porta UDP aberta na internet recebe lixo o
// dia inteiro, e um log por pacote seria o próprio ataque.

// ServidorUDP é o laço de mídia: um socket, um registro e nada mais.
type ServidorUDP struct {
	// A1 preenche os campos que precisar. Nada aqui é lido de fora.
}

// NovoServidorUDP abre o socket em `cfg.PortaUdp` (todas as interfaces).
func NovoServidorUDP(cfg ConfigDaPonte, registro RegistroDeSessoes, log *slog.Logger) (*ServidorUDP, error) {
	panic("F2 lote A1: NovoServidorUDP não implementado")
}

// Ouvir roda o laço de leitura até o contexto morrer. Bloqueia; o `main.go`
// (A2) o chama numa goroutine.
func (s *ServidorUDP) Ouvir(ctx context.Context) error {
	panic("F2 lote A1: ServidorUDP.Ouvir não implementado")
}

// Porta é a porta local de verdade, útil quando o teste pede `:0`.
func (s *ServidorUDP) Porta() int {
	panic("F2 lote A1: ServidorUDP.Porta não implementado")
}

// Fechar derruba o socket. Idempotente.
func (s *ServidorUDP) Fechar() error {
	panic("F2 lote A1: ServidorUDP.Fechar não implementado")
}

// FilaDeQuadros é a rede de segurança contra rajada (§12 F2, "Jitter").
//
// O `WriteSample` com `Duration: 20ms` deixa o pion cuidar do relógio; se o
// UDP chegar em rajada, a mídia acumula e o atraso cresce sem nunca voltar.
// A fila tem teto de `TetoDaFila` quadros (200 ms) e, cheia, **descarta o mais
// antigo** — atraso é pior que buraco numa música.
//
// Uma fila por sessão, criada por quem consome a sessão no laço de UDP; a
// goroutine de drenagem chama `SessaoDeVoz.Publicar`.
type FilaDeQuadros struct {
	// A1 preenche.
}

// NovaFila cria a fila e sobe a goroutine que drena para `publicar`.
func NovaFila(publicar func(opus []byte)) *FilaDeQuadros {
	panic("F2 lote A1: NovaFila não implementado")
}

// Enfileirar põe um quadro na fila; devolve `false` quando teve de descartar
// um quadro velho para caber (o chamador só usa isso para contar no log).
func (f *FilaDeQuadros) Enfileirar(opus []byte) bool {
	panic("F2 lote A1: FilaDeQuadros.Enfileirar não implementado")
}

// Fechar encerra a goroutine de drenagem. Idempotente.
func (f *FilaDeQuadros) Fechar() {
	panic("F2 lote A1: FilaDeQuadros.Fechar não implementado")
}
