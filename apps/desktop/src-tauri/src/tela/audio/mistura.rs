//! A matemática comum do áudio da tela: reduzir a dois canais e levar à taxa
//! da faixa publicada.
//!
//! Este arquivo **não** tem `#[cfg]` nenhum, e é de propósito: nada aqui toca
//! o sistema, e é justamente esta metade que dá para testar. Enquanto ela
//! morava dentro do módulo de WASAPI, os testes abaixo só rodavam numa máquina
//! Windows — ou seja, quase nunca.

/// Como cada amostra chega da plataforma — no Windows, do mixer do sistema.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Amostra {
    F32,
    I16,
    I32,
}

/// Converte quadros intercalados no formato da plataforma para i16 estéreo.
/// Mais de dois canais: ficam os dois primeiros (esquerdo e direito, por
/// convenção do `dwChannelMask` do Windows); mono: duplicado.
pub fn converter_para_estereo(bruto: &[u8], amostra: Amostra, canais: usize, saida: &mut Vec<i16>) {
    let tamanho = match amostra {
        Amostra::I16 => 2,
        Amostra::F32 | Amostra::I32 => 4,
    };
    let ler = |i: usize| -> i16 {
        let b = &bruto[i * tamanho..(i + 1) * tamanho];
        match amostra {
            Amostra::I16 => i16::from_le_bytes([b[0], b[1]]),
            Amostra::I32 => (i32::from_le_bytes([b[0], b[1], b[2], b[3]]) >> 16) as i16,
            Amostra::F32 => {
                let v = f32::from_le_bytes([b[0], b[1], b[2], b[3]]);
                (v.clamp(-1.0, 1.0) * 32767.0) as i16
            }
        }
    };
    let quadros = bruto.len() / (tamanho * canais.max(1));
    for q in 0..quadros {
        let esquerdo = ler(q * canais);
        let direito = if canais >= 2 {
            ler(q * canais + 1)
        } else {
            esquerdo
        };
        saida.push(esquerdo);
        saida.push(direito);
    }
}

/// Reamostragem linear de estéreo intercalado, com estado entre chamadas
/// (a posição fracionária e o último quadro), para não estalar na emenda
/// dos pacotes. Linear é suficiente para 44,1 → 48 kHz em áudio de jogo e
/// vídeo; a taxa do mixer raramente é outra coisa.
pub struct Reamostrador {
    razao: f64,
    /// Posição de leitura na entrada, em quadros, contada a partir do quadro
    /// guardado em `anterior` (que é o quadro -1).
    pos: f64,
    anterior: [i16; 2],
    tem_anterior: bool,
}

impl Reamostrador {
    pub fn new(de: u32, para: u32) -> Self {
        Self {
            razao: f64::from(de) / f64::from(para),
            pos: 0.0,
            anterior: [0, 0],
            tem_anterior: false,
        }
    }

    pub fn processar(&mut self, entrada: &[i16], saida: &mut Vec<i16>) {
        let quadros = entrada.len() / 2;
        if quadros == 0 {
            return;
        }
        if (self.razao - 1.0).abs() < f64::EPSILON {
            saida.extend_from_slice(&entrada[..quadros * 2]);
            return;
        }
        if !self.tem_anterior {
            self.anterior = [entrada[0], entrada[1]];
            self.tem_anterior = true;
            self.pos = 0.0;
        }
        // O quadro -1 é `anterior`; o quadro k ≥ 0 é entrada[k].
        let ler = |k: i64, canal: usize| -> f64 {
            if k < 0 {
                f64::from(self.anterior[canal])
            } else {
                f64::from(entrada[k as usize * 2 + canal])
            }
        };
        // `pos` conta a partir de -1: pos = 0 é o quadro `anterior`.
        let mut p = self.pos;
        while p < quadros as f64 {
            let base = p.floor();
            let frac = p - base;
            let k = base as i64 - 1;
            for canal in 0..2 {
                let a = ler(k, canal);
                let b = ler(k + 1, canal);
                saida.push((a + (b - a) * frac).round().clamp(-32768.0, 32767.0) as i16);
            }
            p += self.razao;
        }
        self.pos = p - quadros as f64;
        self.anterior = [entrada[(quadros - 1) * 2], entrada[(quadros - 1) * 2 + 1]];
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn mesma_taxa_passa_direto() {
        let mut r = Reamostrador::new(48_000, 48_000);
        let mut saida = Vec::new();
        r.processar(&[1, 2, 3, 4], &mut saida);
        assert_eq!(saida, vec![1, 2, 3, 4]);
    }

    #[test]
    fn de_44100_para_48000_produz_mais_quadros_e_mantem_a_rampa() {
        let mut r = Reamostrador::new(44_100, 48_000);
        let entrada: Vec<i16> = (0..441).flat_map(|i| [i * 10, -(i * 10)]).collect();
        let mut saida = Vec::new();
        r.processar(&entrada, &mut saida);
        let quadros = saida.len() / 2;
        assert!((478..=482).contains(&quadros), "{quadros}");
        // rampa continua monótona no canal esquerdo
        let esquerdo: Vec<i16> = saida.iter().step_by(2).copied().collect();
        assert!(esquerdo.windows(2).all(|w| w[0] <= w[1]));
        // e o direito é o espelho
        assert!(saida.chunks(2).all(|c| c[0] == -c[1]));
    }

    #[test]
    fn a_emenda_entre_chamadas_nao_pula() {
        let mut r = Reamostrador::new(44_100, 48_000);
        let mut saida = Vec::new();
        r.processar(&[0, 0, 100, 100], &mut saida);
        r.processar(&[200, 200, 300, 300], &mut saida);
        let esquerdo: Vec<i16> = saida.iter().step_by(2).copied().collect();
        assert!(
            esquerdo.windows(2).all(|w| w[1] - w[0] <= 100),
            "{esquerdo:?}"
        );
    }

    #[test]
    fn converte_float_e_reduz_canais() {
        let mut saida = Vec::new();
        // dois quadros de 4 canais, float: só L e R sobrevivem
        let mut bruto = Vec::new();
        for v in [0.5f32, -0.5, 0.1, 0.1, 1.0, -1.0, 0.0, 0.0] {
            bruto.extend_from_slice(&v.to_le_bytes());
        }
        converter_para_estereo(&bruto, Amostra::F32, 4, &mut saida);
        assert_eq!(saida, vec![16383, -16383, 32767, -32767]);

        let mut mono = Vec::new();
        converter_para_estereo(&7i16.to_le_bytes(), Amostra::I16, 1, &mut mono);
        assert_eq!(mono, vec![7, 7]);
    }
}
