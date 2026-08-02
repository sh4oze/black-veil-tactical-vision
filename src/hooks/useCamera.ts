import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraErrorInfo, CameraStatus } from '../types/tracking';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<CameraErrorInfo | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setVideoSize({ w: 0, h: 0 });
    setStatus('idle');
  }, []);

  const start = useCallback(
    async (mode: 'user' | 'environment' = facingMode) => {
      setError(null);

      if (!window.isSecureContext) {
        setError({
          type: 'insecure',
          message: 'Esta aplicação precisa ser executada em HTTPS ou localhost para acessar a câmera.',
        });
        setStatus('error');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError({
          type: 'unsupported',
          message: 'Este navegador não suporta acesso à câmera (getUserMedia indisponível).',
        });
        setStatus('error');
        return;
      }

      setStatus('starting');
      streamRef.current?.getTracks().forEach((t) => t.stop());

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setVideoSize({ w: video.videoWidth, h: video.videoHeight });
        }
        setFacingMode(mode);
        setStatus('active');
      } catch (err) {
        const e = err as DOMException;
        let type: CameraErrorInfo['type'] = 'other';
        let message = 'Não foi possível acessar a câmera.';
        if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
          type = 'denied';
          message = 'Permissão de câmera negada. Autorize o acesso para usar o BLACK VEIL.';
        } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
          type = 'not_found';
          message = 'Nenhuma câmera foi encontrada neste dispositivo.';
        } else if (e?.name === 'NotReadableError') {
          message = 'A câmera está sendo usada por outro aplicativo.';
        }
        setError({ type, message });
        setStatus('error');
      }
    },
    [facingMode],
  );

  const switchFacing = useCallback(() => {
    return start(facingMode === 'user' ? 'environment' : 'user');
  }, [facingMode, start]);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) setVideoSize({ w: video.videoWidth, h: video.videoHeight });
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, status, error, facingMode, videoSize, start, stop, switchFacing, handleLoadedMetadata };
}
