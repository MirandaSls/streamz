package main

// ── Lote A2 (WS + LiveKit) preenche. ──
//
// A ponte de voz: um binário, dois sockets (WS e UDP), nenhum estado em disco.
//
//	ponte-voz [--dump-pacote]
//
// Ambiente (§D5.5) — todas obrigatórias menos a última:
//
//	PONTE_VOZ_PORTA_WS     8080
//	PONTE_VOZ_PORTA_UDP    7883
//	PONTE_VOZ_IP_PUBLICO   143.95.161.17   (IP, não hostname — §D5.4)
//	PONTE_VOZ_SEGREDO      valida o JWT do VOICE_SERVER_UPDATE
//	API_INTERNA_URL        http://api:3333
//
// `LIVEKIT_URL` e as chaves do LiveKit **não** entram aqui: a URL e o token
// chegam dentro do JWT, assinados pela API (§D5.6).
//
// Nada lê `os.Getenv` fora deste arquivo — o resto recebe `ConfigDaPonte`.

func main() {
	panic("F2 lote A2: main não implementado")
}

// AvisarQueCaiu conta à API que uma sessão morreu, para o bot sumir da coluna
// e do palco do web (§D5.7):
//
//	POST {API_INTERNA_URL}/api/interno/ponte-voz/estado
//	X-Ponte-Segredo: {PONTE_VOZ_SEGREDO}
//	{"bot":"<snowflake>","canal":"<snowflake>","conectado":false}
//
// A carência de 45 s do gateway do web **não** vale para bot: bot que caiu,
// caiu. Falha na chamada é só log — não há o que fazer, e travar o desligamento
// de uma sessão por causa dela seria pior.
func AvisarQueCaiu(cfg ConfigDaPonte, bot string, canal string, conectado bool) {
	panic("F2 lote A2: AvisarQueCaiu não implementado")
}
