# BLACK VEIL — Tactical Vision System

Experiência visual interativa com estética militar, obscura e futurista, que usa a câmera do
navegador para rastrear rosto e mãos **em tempo real e 100% no lado do cliente**. Não há backend,
não há chave de API paga, e nenhuma imagem, vídeo ou dado biométrico é gravado, armazenado ou
enviado a qualquer servidor.

## Como rodar

Pré-requisitos: Node.js 18+.

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite (por padrão `http://localhost:5173`). A câmera só é solicitada
depois que você clicar em **INICIAR SISTEMA** na tela inicial.

> A câmera exige um **contexto seguro**: `localhost` funciona sem HTTPS; para acessar de outro
> dispositivo na rede (ex.: celular), é preciso HTTPS ou usar um túnel (ngrok, Tailscale Funnel etc.).

Outros comandos:

```bash
npm run build     # build de produção (tsc -b && vite build)
npm run preview   # serve o build de produção localmente
npm run lint       # apenas checagem de tipos (tsc --noEmit)
```

## Stack

- React 18 + Vite + TypeScript
- `@mediapipe/tasks-vision` — `FaceLandmarker` e `HandLandmarker` (WASM, roda no navegador)
- Canvas API para todos os overlays (mira, moldura facial, esqueleto das mãos)
- Web Audio API para os efeitos sonoros (sintetizados via osciladores, sem arquivos de áudio)
- CSS puro para o HUD e a estética tática (grid, vinheta, scanline, ruído)

Os modelos (`.task`) e o runtime WASM são carregados sob demanda de um CDN público e gratuito
(`storage.googleapis.com` / `cdn.jsdelivr.net`, hospedagem oficial do MediaPipe) — não é uma API
paga, não requer chave, e não envolve o vídeo do usuário: apenas os pesos do modelo trafegam pela
rede, uma única vez, e ficam em cache do navegador.

## O que foi implementado

- **Tela inicial** com aviso de privacidade e botão "INICIAR SISTEMA"; a permissão de câmera só é
  pedida após o clique.
- **Rastreamento facial real** (MediaPipe Face Landmarker, 1 rosto): mira animada sobre a testa,
  moldura tecnológica com cantos, escala da mira conforme a distância aparente (distância
  interocular), suavização por média móvel exponencial, estados `VARREDURA EM ANDAMENTO` /
  `ALVO IDENTIFICADO` / `ALVO PERDIDO` com histerese (evita flicker em falhas de 1 frame).
- **Rastreamento de mãos real** (MediaPipe Hand Landmarker, até 2 mãos): esqueleto cibernético com
  21 pontos, conexões com glow neon, malha da palma, pulso de energia percorrendo os dedos,
  suavização por mão, fade suave quando a mão some, e identificação correta de mão esquerda/direita
  respeitando o espelhamento do vídeo.
- **Gestos**: mão aberta, punho fechado, apontar, sinal de paz, polegar para cima, pinça e duas mãos
  levantadas — todos com um estabilizador (janela de frames + cooldown) para evitar falsos
  positivos e flicker.
- **HUD tático**: grid, vinheta, scanline, ruído digital sutil, painéis de status (rostos, mãos,
  FPS, intervalo de inferência, confiança, gesto atual), log de eventos rolante, disclaimer de
  dados biométricos simulados.
- **Sons** sintetizados por Web Audio API (início desativado, ativado por clique do usuário) para
  inicialização, rosto detectado, travamento de mira, mão detectada, gesto confirmado, alvo
  perdido e alerta (rendição).
- **Controles**: ligar/desligar câmera (para corretamente todas as tracks do `MediaStream`),
  ativar/desativar som, mostrar/ocultar HUD, mostrar/ocultar mira, mostrar/ocultar esqueleto,
  tela cheia, alternar câmera frontal/traseira (em dispositivos com múltiplas câmeras).
- **Responsividade**: overlays recalculados via `ResizeObserver` e mapeamento de coordenadas que
  reproduz o comportamento `object-fit: cover`, então mira, moldura e esqueleto permanecem
  alinhados ao vídeo em qualquer proporção de tela (desktop, tablet, celular).
- **Tratamento de erros**: mensagens específicas para permissão negada, câmera inexistente,
  navegador incompatível, contexto inseguro (não-HTTPS/localhost) e falha ao carregar os modelos
  do MediaPipe.
- **Performance**: um loop de inferência (`requestAnimationFrame`) desacoplado dos loops de
  desenho de cada overlay; o intervalo de inferência se ajusta automaticamente (25–90ms) conforme
  o tempo de processamento medido, reduzindo a carga em dispositivos mais lentos. Não há estado do
  React atualizado a cada frame — os dados de rastreamento vivem em `useRef` e só o HUD (texto)
  recebe atualizações agrupadas a cada ~400ms.

## Arquitetura

```text
src/
  components/
    StartupScreen.tsx        tela inicial + aviso de privacidade
    CameraStage.tsx           câmera + loop de inferência + orquestração de eventos/sons
    FaceOverlay.tsx           canvas da mira + moldura facial (loop de desenho próprio)
    HandSkeletonOverlay.tsx   canvas do esqueleto das mãos (loop de desenho próprio)
    TacticalHUD.tsx           painéis de status, log, efeitos de fundo (grid/vinheta/scanline)
    ControlPanel.tsx          botões de controle
  hooks/
    useCamera.ts               getUserMedia, start/stop, troca de câmera, erros
    useFaceTracking.ts         carrega o FaceLandmarker, suaviza e classifica o status
    useHandTracking.ts         carrega o HandLandmarker, suaviza, estabiliza gestos, fade-out
  services/
    faceLandmarker.ts          singleton assíncrono do FaceLandmarker (GPU com fallback CPU)
    handLandmarker.ts          singleton assíncrono do HandLandmarker (GPU com fallback CPU)
    audioEngine.ts             sons sintetizados via Web Audio API
  utils/
    smoothing.ts                filtros de média móvel exponencial (valor, ponto, landmarks)
    coordinates.ts              mapeamento normalizado → canvas (cover-fit + espelhamento)
    drawing.ts                  desenho da mira, moldura facial e esqueleto de mão
    gestureDetection.ts         classificação de forma da mão + estabilizador com cooldown
  types/
    tracking.ts                 tipos compartilhados
```

## Limitações técnicas conhecidas

- **Heurísticas, não biometria real**: distância aparente, gestos e confiança são estimativas
  geométricas simples (distâncias entre landmarks), não reconhecimento de identidade nem métricas
  clinicamente validadas. Isso é intencional — o app não identifica pessoas.
- **Primeira carga depende de rede**: os arquivos `.task` do MediaPipe (alguns MB) e o runtime WASM
  são baixados de um CDN público na primeira execução. Sem conexão, o carregamento falha (o app
  mostra uma mensagem de erro clara). Depois da primeira vez, o navegador tende a cachear os
  arquivos.
- **Suporte a WebGL/WASM SIMD**: navegadores muito antigos ou sem aceleração de GPU podem falhar no
  delegate `GPU`; o app já tenta automaticamente um fallback para `CPU`, mais lento porém mais
  compatível.
- **`numFaces: 1`**: o rastreamento facial foi propositalmente limitado a um rosto por vez (a mira
  e a moldura são desenhadas para um único alvo). O rastreamento de mãos suporta até 2 mãos.
  Para múltiplos rostos seria necessário adaptar `FaceOverlay` e o HUD.
- **Gesto "duas mãos levantadas"** usa um limiar simples de posição vertical do pulso — funciona
  bem para o caso de "mãos acima da linha do peito", mas não é uma pose completa de rendição.
- **iOS Safari**: `getUserMedia` e autoplay de vídeo funcionam, porém o áudio só inicia após um
  toque explícito no botão de som (já implementado), conforme exigido pela política de autoplay.
- Testado com Playwright headless (Chromium com dispositivo de câmera falso) para validar o fluxo
  de tela inicial → câmera → HUD → liga/desliga → redimensionamento, sem erros de console. Não foi
  possível validar visualmente rosto/mãos reais neste ambiente sem uma câmera física — recomenda-se
  um teste manual rápido em um navegador com webcam antes de considerar o sistema definitivo.
