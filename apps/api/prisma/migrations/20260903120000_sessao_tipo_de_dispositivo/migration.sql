-- A aba "Dispositivos" não distinguia o app de desktop do navegador: o Tauri 2
-- usa WebView2, cujo `User-Agent` é o do Edge. O cliente passa a se declarar no
-- cabeçalho `X-Streamz-Client` e a classificação é guardada aqui, porque o
-- cabeçalho só existe no instante do login/refresh.
-- Sessões antigas ficam com NULL e são reclassificadas no próximo refresh.
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "dispositivo" TEXT;
