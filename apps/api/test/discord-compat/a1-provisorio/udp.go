package main

// PROVISÓRIO — ver `LEIA-ME.md` deste diretório. Não é o lote A1.

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"sync"
)

type ServidorUDP struct {
	conn     *net.UDPConn
	registro RegistroDeSessoes
	log      *slog.Logger

	mu    sync.Mutex
	filas map[uint32]*FilaDeQuadros
}

func NovoServidorUDP(cfg ConfigDaPonte, registro RegistroDeSessoes, log *slog.Logger) (*ServidorUDP, error) {
	conn, err := net.ListenUDP("udp", &net.UDPAddr{Port: cfg.PortaUdp})
	if err != nil {
		return nil, fmt.Errorf("abrir %d/udp: %w", cfg.PortaUdp, err)
	}
	return &ServidorUDP{conn: conn, registro: registro, log: log, filas: map[uint32]*FilaDeQuadros{}}, nil
}

func (s *ServidorUDP) Ouvir(ctx context.Context) error {
	go func() {
		<-ctx.Done()
		_ = s.conn.Close()
	}()
	buffer := make([]byte, 2048)
	for {
		n, origem, err := s.conn.ReadFromUDP(buffer)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		pacote := buffer[:n]

		if EhPedidoDeDescoberta(pacote) {
			ssrc, ok := LerPedidoDeDescoberta(pacote)
			if !ok {
				continue
			}
			sessao, achou := s.registro.PorSSRC(ssrc)
			if !achou {
				continue
			}
			sessao.FixarOrigem(origem)
			resposta := MontarRespostaDeDescoberta(ssrc, origem.IP.String(), uint16(origem.Port))
			if _, err := s.conn.WriteToUDP(resposta, origem); err != nil {
				s.log.Warn("responder a descoberta falhou", "erro", err)
			}
			s.log.Info("descoberta de IP respondida", "ssrc", ssrc, "origem", origem.String())
			continue
		}

		ssrc, ok := SSRCDoPacote(pacote)
		if !ok {
			continue
		}
		sessao, achou := s.registro.PorSSRC(ssrc)
		if !achou {
			continue
		}
		conhecida := sessao.Origem()
		if conhecida == nil || !conhecida.IP.Equal(origem.IP) || conhecida.Port != origem.Port {
			continue
		}
		opus, ok := sessao.Decifrar(pacote)
		if !ok {
			continue
		}
		s.fila(sessao).Enfileirar(opus)
	}
}

func (s *ServidorUDP) fila(sessao SessaoDeVoz) *FilaDeQuadros {
	s.mu.Lock()
	defer s.mu.Unlock()
	if f, tem := s.filas[sessao.SSRC()]; tem {
		return f
	}
	f := NovaFila(sessao.Publicar)
	s.filas[sessao.SSRC()] = f
	return f
}

func (s *ServidorUDP) Porta() int {
	if addr, ok := s.conn.LocalAddr().(*net.UDPAddr); ok {
		return addr.Port
	}
	return 0
}

func (s *ServidorUDP) Fechar() error { return s.conn.Close() }

type FilaDeQuadros struct {
	quadros chan []byte
	uma     sync.Once
}

func NovaFila(publicar func(opus []byte)) *FilaDeQuadros {
	f := &FilaDeQuadros{quadros: make(chan []byte, TetoDaFila)}
	go func() {
		for quadro := range f.quadros {
			publicar(quadro)
		}
	}()
	return f
}

func (f *FilaDeQuadros) Enfileirar(opus []byte) bool {
	select {
	case f.quadros <- opus:
		return true
	default:
		// Cheia: descarta o mais antigo. Atraso é pior que buraco.
		select {
		case <-f.quadros:
		default:
		}
		select {
		case f.quadros <- opus:
		default:
		}
		return false
	}
}

func (f *FilaDeQuadros) Fechar() { f.uma.Do(func() { close(f.quadros) }) }
