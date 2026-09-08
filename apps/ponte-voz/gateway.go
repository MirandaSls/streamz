package main

import (
	"context"
	"log/slog"
)

// ── Lote A2 (WS + LiveKit) preenche. ──
//
// O Voice Gateway do Discord, versão 8, **tolerante ao v4** (§D5.2): o
// Lavalink/koe ainda fala v4 em algumas versões e a única diferença que nos
// atinge é o formato do heartbeat (`d` int no v4, `{t, seq_ack}` no v8) — e a
// regra é **ecoar no mesmo formato que recebeu**.
//
// As libs montam `wss://<endpoint>/?v=8` sem caminho: por isso um host próprio
// (`voz.streamz.chat`) e não um path da API. Aceitamos qualquer caminho.
//
// Opcodes (§D5.2), na direção em que nos importam:
//
//	→ 0 IDENTIFY {server_id, user_id, session_id, token}   valida o JWT
//	→ 1 SELECT_PROTOCOL {protocol:"udp", data:{address, port, mode}}
//	← 2 READY {ssrc, ip, port, modes, heartbeat_interval}
//	→ 3 HEARTBEAT
//	← 4 SESSION_DESCRIPTION {mode, secret_key:[32], dave_protocol_version:0}
//	→ 5 SPEAKING (aceita e ignora — o LiveKit calcula por nível de áudio)
//	← 6 HEARTBEAT_ACK (no formato que recebeu)
//	→ 7 RESUME
//	← 8 HELLO {heartbeat_interval: 13750}
//	← 9 RESUMED
//	  11/13 CLIENTS_CONNECT / CLIENT_DISCONNECT — nunca mandamos
//	  21-31 DAVE/MLS — não implementamos; `dave_protocol_version: 0` faz o
//	        cliente negociar para baixo.
//
// Opcode desconhecido: **ignorar**, nunca fechar. Um close por op novo do
// Discord é o jeito mais rápido de a ponte parar de funcionar sozinha quando
// uma lib for atualizada.

// IntervaloDeHeartbeatMs é o que vai no HELLO. 13750 é o do Discord (§D5.2).
const IntervaloDeHeartbeatMs = 13750

// ServidorDeVoz é o HTTP+WS da ponte.
type ServidorDeVoz struct {
	// A2 preenche.
}

// NovoServidorDeVoz monta o servidor. Não escuta ainda.
func NovoServidorDeVoz(cfg ConfigDaPonte, registro RegistroDeSessoes, log *slog.Logger) *ServidorDeVoz {
	panic("F2 lote A2: NovoServidorDeVoz não implementado")
}

// Servir escuta em `cfg.PortaWs` até o contexto morrer. Além do WS, responde
// `GET /saude` com 200 — é o healthcheck do compose.
func (s *ServidorDeVoz) Servir(ctx context.Context) error {
	panic("F2 lote A2: ServidorDeVoz.Servir não implementado")
}

// ValidarToken confere o JWT que chegou no `IDENTIFY.token`: assinatura HS256
// com `cfg.Segredo`, `aud == "ponte-voz"`, `exp` no futuro, e — o que importa
// de verdade — `sub`/`gid`/`sid` **iguais** ao `user_id`/`server_id`/
// `session_id` do próprio IDENTIFY. Sem essa comparação, um token vazado
// entraria em qualquer sala.
//
// Falha: close 4004 (`Authentication failed`), que as libs tratam como
// irrecuperável — é o certo, o token não vai melhorar sozinho.
func ValidarToken(segredo, token, serverID, userID, sessionID string) (Reivindicacao, error) {
	panic("F2 lote A2: ValidarToken não implementado")
}
