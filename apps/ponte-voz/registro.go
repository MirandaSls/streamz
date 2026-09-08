package main

import (
	"sync"
	"sync/atomic"
)

// A implementação do `RegistroDeSessoes` do `contrato.go`.
//
// **Arquivo do coordenador**: os lotes A1 e A2 usam, nenhum dos dois edita.
//
// Um `sync.Map` seria o reflexo, mas o teto de sessões precisa de um contador
// consistente com a inserção — e um mapa com `RWMutex` de trinta linhas é mais
// fácil de ler e de provar do que a versão esperta.
type registroEmMemoria struct {
	mu       sync.RWMutex
	porSSRC  map[uint32]SessaoDeVoz
	proximo  atomic.Uint32
	teto     int
	descarta func(ssrc uint32)
}

// TetoDeSessoes é o limite de sessões simultâneas no processo.
//
// Existe pela mesma razão que o teto da fila: a porta UDP é pública e o WS
// também. Mil sessões são muito mais bots de música do que uma instância do
// Streamz jamais terá, e ainda assim é memória limitada.
const TetoDeSessoes = 1000

// NovoRegistro monta o registro. `descarta` é chamado quando o teto recusa uma
// sessão (para o gateway fechar o WS com um motivo legível); pode ser nil.
func NovoRegistro(descarta func(ssrc uint32)) RegistroDeSessoes {
	return &registroEmMemoria{
		porSSRC:  make(map[uint32]SessaoDeVoz),
		teto:     TetoDeSessoes,
		descarta: descarta,
	}
}

// ProximoSSRC começa em 1: SSRC 0 é válido no RTP mas é o valor que um buffer
// zerado tem, e não queremos que um pacote de lixo caia numa sessão real.
func (r *registroEmMemoria) ProximoSSRC() uint32 {
	return r.proximo.Add(1)
}

func (r *registroEmMemoria) Registrar(s SessaoDeVoz) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.porSSRC) >= r.teto {
		if r.descarta != nil {
			r.descarta(s.SSRC())
		}
		return
	}
	r.porSSRC[s.SSRC()] = s
}

func (r *registroEmMemoria) PorSSRC(ssrc uint32) (SessaoDeVoz, bool) {
	r.mu.RLock()
	s, achou := r.porSSRC[ssrc]
	r.mu.RUnlock()
	if !achou {
		return nil, false
	}
	// Sessão morta é o mesmo que sessão inexistente para quem lê do socket; a
	// remoção fica para quem a fechou, não para o caminho quente.
	if !s.Viva() {
		return nil, false
	}
	return s, true
}

func (r *registroEmMemoria) Remover(ssrc uint32) {
	r.mu.Lock()
	delete(r.porSSRC, ssrc)
	r.mu.Unlock()
}

func (r *registroEmMemoria) Tamanho() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.porSSRC)
}
