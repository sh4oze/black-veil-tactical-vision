import { useMemo } from 'react';

interface StartupScreenProps {
  onStart: () => void;
}

export default function StartupScreen({ onStart }: StartupScreenProps) {
  const compatibility = useMemo(() => {
    const secure = typeof window !== 'undefined' ? window.isSecureContext : true;
    const hasGetUserMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    if (!secure) {
      return 'Este dispositivo não está em um contexto seguro (HTTPS ou localhost). A câmera não poderá ser acessada.';
    }
    if (!hasGetUserMedia) {
      return 'Este navegador não suporta acesso à câmera (getUserMedia indisponível). Utilize um navegador atualizado.';
    }
    return null;
  }, []);

  return (
    <div className="startup-screen">
      <div className="tactical-grid" />
      <div className="tactical-vignette" />
      <div className="tactical-noise" />

      <div className="startup-content">
        <div className="startup-glyph">◈</div>
        <h1 className="startup-title">
          BLACK <span>VEIL</span>
        </h1>
        <p className="startup-subtitle">TACTICAL VISION SYSTEM</p>

        <div className="startup-divider" />

        <p className="startup-privacy">
          Esta aplicação utiliza a câmera exclusivamente para processamento local em tempo real. Nenhuma imagem,
          vídeo ou informação biométrica será gravada, armazenada ou enviada. Todo o processamento — rastreamento
          facial, rastreamento de mãos e reconhecimento de gestos — ocorre inteiramente no seu navegador.
        </p>

        {compatibility && <p className="startup-error">{compatibility}</p>}

        <button className="btn-tactical btn-tactical-primary" onClick={onStart} disabled={!!compatibility}>
          INICIAR SISTEMA
        </button>

        <p className="startup-footnote">DADOS BIOMÉTRICOS SIMULADOS · NENHUM DADO É ARMAZENADO OU TRANSMITIDO</p>
        <p className="startup-footnote">© 2026 MAGNO A. FRUTUOSO · TODOS OS DIREITOS RESERVADOS</p>
      </div>
    </div>
  );
}
