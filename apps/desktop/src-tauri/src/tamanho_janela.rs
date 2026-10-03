//! Tamanho inicial da janela principal a partir do monitor em que ela vai abrir.
//!
//! Por que existe: o `tauri.conf.json` fixa 1440x900 lógicos, o que estoura a
//! tela num notebook 1366x768 ou num 1920x1080 a 150% (que vira 1280x720
//! lógicos) e fica acanhado num 4K. A conta mora aqui, separada do Tauri, para
//! ser testável sem monitor nem janela.

/// Mínimo "confortável" do layout de três colunas — o mesmo `minWidth` /
/// `minHeight` do `tauri.conf.json`. Só cede quando a tela é menor que isso.
const MIN_LARGURA: f64 = 1100.0;
const MIN_ALTURA: f64 = 700.0;

/// Teto do tamanho inicial: num monitor grande, abrir ocupando 78% de um 4K
/// deixaria a conversa com linhas longas demais; o usuário maximiza se quiser.
const MAX_LARGURA: f64 = 1920.0;
const MAX_ALTURA: f64 = 1200.0;

/// Fração da área útil ocupada ao abrir: sobra borda para a janela parecer
/// janela (e não maximizada) e para o usuário ver o que está atrás.
const FRACAO_LARGURA: f64 = 0.78;
const FRACAO_ALTURA: f64 = 0.80;

/// Recebe a área útil do monitor (sem barra de tarefas) em pixels **físicos** e
/// o fator de escala, e devolve `(largura, altura, min_largura, min_altura)` em
/// pixels **lógicos**, que é o que o `WebviewWindowBuilder` espera.
///
/// Garantias: `largura >= min_largura`, `altura >= min_altura` e nenhum dos
/// quatro passa da área útil. O mínimo também é rebaixado à área útil porque um
/// `min_inner_size` maior que a tela impediria o usuário de encaixar a janela.
///
/// Quem chama garante `area_w`, `area_h` e `escala` finitos e positivos.
pub fn tamanho_janela(area_w: f64, area_h: f64, escala: f64) -> (f64, f64, f64, f64) {
    let aw = area_w / escala;
    let ah = area_h / escala;
    let min_w = MIN_LARGURA.min(aw);
    let min_h = MIN_ALTURA.min(ah);
    // `clamp` entra em pânico com mínimo > máximo; aqui `min_w <= 1100 < 1920`
    // e `min_h <= 700 < 1200`, então nunca acontece. O `.min(aw)` final não
    // derruba abaixo do mínimo porque `min_w <= aw`.
    let w = (aw * FRACAO_LARGURA).clamp(min_w, MAX_LARGURA).min(aw);
    let h = (ah * FRACAO_ALTURA).clamp(min_h, MAX_ALTURA).min(ah);
    (w, h, min_w, min_h)
}

#[cfg(test)]
mod testes {
    use super::tamanho_janela;

    const EPS: f64 = 1e-9;

    /// Invariantes que valem para qualquer monitor.
    fn conferir(area_w: f64, area_h: f64, escala: f64) -> (f64, f64, f64, f64) {
        let (w, h, min_w, min_h) = tamanho_janela(area_w, area_h, escala);
        let aw = area_w / escala;
        let ah = area_h / escala;
        assert!(w >= min_w - EPS, "largura {w} abaixo do mínimo {min_w}");
        assert!(h >= min_h - EPS, "altura {h} abaixo do mínimo {min_h}");
        assert!(w <= aw + EPS, "largura {w} passa da área útil {aw}");
        assert!(h <= ah + EPS, "altura {h} passa da área útil {ah}");
        assert!(min_w <= aw + EPS && min_h <= ah + EPS);
        assert!(w <= 1920.0 + EPS && h <= 1200.0 + EPS);
        (w, h, min_w, min_h)
    }

    fn perto(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-6
    }

    #[test]
    fn notebook_1366x768() {
        // Área útil 1366x728: a fração daria 1065x582, o mínimo segura em 1100x700.
        let (w, h, min_w, min_h) = conferir(1366.0, 728.0, 1.0);
        assert!(perto(w, 1100.0) && perto(h, 700.0));
        assert!(perto(min_w, 1100.0) && perto(min_h, 700.0));
    }

    #[test]
    fn full_hd_125() {
        // 1536x832 lógicos.
        let (w, h, min_w, min_h) = conferir(1920.0, 1040.0, 1.25);
        assert!(perto(w, 1536.0 * 0.78));
        assert!(perto(h, 700.0));
        assert!(perto(min_w, 1100.0) && perto(min_h, 700.0));
    }

    #[test]
    fn full_hd_150_cede_o_minimo_de_altura() {
        // 1280x693,3 lógicos: a altura mínima de 700 não cabe e desce à área útil.
        let (w, h, min_w, min_h) = conferir(1920.0, 1040.0, 1.5);
        let ah = 1040.0 / 1.5;
        assert!(perto(w, 1100.0));
        assert!(perto(min_w, 1100.0));
        assert!(perto(min_h, ah));
        assert!(perto(h, ah));
    }

    #[test]
    fn qhd_100() {
        let (w, h, _, _) = conferir(2560.0, 1400.0, 1.0);
        assert!(perto(w, 1920.0));
        assert!(perto(h, 1120.0));
    }

    #[test]
    fn uhd_100_bate_no_teto() {
        let (w, h, _, _) = conferir(3840.0, 2120.0, 1.0);
        assert!(perto(w, 1920.0) && perto(h, 1200.0));
    }

    #[test]
    fn uhd_150() {
        // 2560x1413,3 lógicos.
        let (w, h, min_w, min_h) = conferir(3840.0, 2120.0, 1.5);
        assert!(perto(w, 1920.0));
        assert!(perto(h, 2120.0 / 1.5 * 0.80));
        assert!(perto(min_w, 1100.0) && perto(min_h, 700.0));
    }
}
