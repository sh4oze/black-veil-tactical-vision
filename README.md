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

Abra o endereço exibido pelo Vite (por padrão `http://localhost:5173`). Antes de tudo, a aplicação
pede login (ver [Login e segurança](#login-e-segurança) abaixo). Depois de autenticado, a câmera só
é solicitada quando você clicar em **INICIAR SISTEMA** na tela inicial.

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

## Interaction Modules

Onze módulos de interação opcionais, todos **desativados por padrão**, ativados individualmente pelo
painel **INTERACTION MODULES** (botão "MÓDULOS") ou pelo **Gesture Menu**. Por padrão apenas um
módulo fica ativo por vez — ativar um novo desativa o anterior automaticamente — a menos que
**ALLOW MULTIPLE MODULES** esteja ligado. Todos compartilham os mesmos resultados de rastreamento
já computados por `CameraStage` (nenhum módulo roda inferência própria) e reagem de verdade aos
landmarks — nada é "efeito por botão".

| Módulo | Gesto principal |
| --- | --- |
| **Energy Orb** | Duas palmas abertas uma de frente para a outra formam uma esfera; afastar/aproximar as mãos escala; girar rotaciona; dois punhos fechados carregam; abrir rápido libera uma onda de partículas. |
| **Holographic Shield** | Uma palma aberta voltada para a câmera ergue um escudo circular preso à mão (posição, escala e "inclinação" seguem a mão); fechar o punho recolhe. Reage a impactos do Energy Pulse. |
| **Gesture Menu** | Segurar a palma aberta ~1s abre um menu holográfico; a outra mão vira cursor (indicador) e a pinça funciona como clique; punho fechado fecha o menu. |
| **Virtual Objects** | Seis primitivas holográficas (cubo, esfera, arquivo, núcleo de dados, drone, disco) — pinça seleciona/arrasta, duas mãos escalam e giram, soltar aplica a velocidade real do arrasto (lança), colisão com bordas e encaixe em zonas de dock. |
| **Telekinesis** | Palma aberta perto de um objeto o faz flutuar; fechar o punho prende (com linhas de energia até a mão); abrir rápido arremessa usando a velocidade recente do pulso. |
| **Energy Pulse** | Apontar mira na ponta do indicador; uma pinça rápida dispara um pulso de energia. Inclui minijogo sempre ativo de alvo holográfico com pontuação, precisão e tempo de reação. |
| **Particle Field** | Campo de partículas ambiente: palma aberta repele, punho fechado atrai, pinça concentra, movimento circular cria vórtice, duas mãos afastando/aproximando expande/comprime o campo, movimento rápido gera onda de choque. |
| **Air Portal** | Desenhar um círculo no ar com o indicador (validado pela trajetória real do dedo, não por pose única) abre um portal; a distância entre as mãos redimensiona; dois punhos fecham. |
| **Gesture Hacking** | Minijogo de níveis progressivos alternando entre tocar nós numerados em ordem (pinça como clique) e manter a palma sobre um "scanner"; timer, ACCESS GRANTED/DENIED, reinício automático ou por palma aberta sustentada. |
| **Motion Echo** | Ecos translúcidos e defasados do esqueleto das mãos e da posição da cabeça, usando o histórico de landmarks já compartilhado — nenhuma inferência extra. |
| **Phantom Flame** | Efeito ambiente — nenhum gesto de ativação. Enquanto o módulo está ligado, chamas procedurais envolvem o esqueleto de cada mão detectada e brasas sobem das pontas dos dedos; quanto mais rápido a mão se move, mais intensa e "trilhada" fica a chama (estilo "cavaleiro fantasma"). |

### Painel de configurações

Botão **CONFIG** abre o painel completo:

- **Tracking**: liga/desliga Face Tracking, Hand Tracking, Target Reticle, Hand Skeleton e Gesture
  Recognition individualmente (desligar Face/Hand Tracking pausa a respectiva inferência, não só o
  desenho).
- **Interactions**: os mesmos 11 módulos.
- **Visual Quality**: Low / Medium / High / Ultra / Automatic — controla densidade de partículas e
  efeitos secundários (glow, distorção); no modo Automatic a qualidade é recalculada a partir do FPS
  medido em tempo real.
- **Options**: Allow Multiple Modules, Sound Effects, Voice Feedback (lê os eventos do HUD em voz
  via `SpeechSynthesis`, nativo do navegador), Show Debug Landmarks (pontos numerados sobre mãos e
  rosto), Show FPS, Gesture Sensitivity, Gesture Confirmation Time, Tracking Smoothing e Reset
  Modules.

Preferências (qualidade, sensibilidade, opções) são salvas apenas em `localStorage`
(`blackveil.preferences.v1`) — **os módulos ativos nunca são persistidos**, todos voltam a
desligado a cada recarregamento, por design.

### Arquitetura dos módulos

```text
src/
  modules/
    energyOrb/ | holographicShield/ | gestureMenu/ | virtualObjects/ | telekinesis/
    energyPulse/ | particleField/ | airPortal/ | gestureHacking/ | motionEcho/
      index.ts                     cada um exporta createXModule(): InteractionModule
    shared/
      handGeometry.ts              abertura da mão, pinça, normal da palma, centro da palma
      particles.ts                 ParticlePool com object pooling (sem alocação por frame)
      impactBus.ts                 pub/sub para reação cross-module a impactos (ex.: Energy Pulse → Shield)
      stubModule.ts                placeholder usado durante o desenvolvimento incremental
  hooks/
    useInteractionModules.ts       instancia os 11 módulos, liga ativação/desativação ao store
    useGestureStability.ts         GestureStateMachine: IDLE → DETECTING → ACTIVE → RELEASING → COOLDOWN
    useMotionHistory.ts            histórico de landmarks por mão (velocidade, trajetória, circularidade)
  store/
    interactionStore.ts            estado global (módulos, qualidade, opções) + persistência local
    moduleEvents.ts                pub/sub para módulos emitirem linhas de log no HUD
  components/
    InteractionModulesLayer.tsx    canvas + loop próprio; monta o TrackingContext e chama update()/render()
    InteractionModulesPanel.tsx    painel rápido "INTERACTION MODULES"
    SettingsPanel.tsx              painel completo (Tracking/Interactions/Visual Quality/Options)
    ModuleToggleList.tsx           lista de módulos reutilizada pelos dois painéis acima
  types/
    modules.ts                     InteractionModule, TrackingContext, ModuleId etc.
```

Cada módulo implementa `InteractionModule` (`activate/update/render/reset/deactivate`) e é
desacoplado dos demais — a única forma de comunicação entre módulos é o `impactBus` opcional
(ex.: Energy Pulse avisa quando um pulso atinge um ponto do canvas; Holographic Shield reage se
estiver por perto). Desativar um módulo chama `reset()` imediatamente: partículas, objetos, timers
e estados de gesto são limpos e a próxima renderização do canvas simplesmente para de desenhá-lo.

O loop de `InteractionModulesLayer` roda a ~60fps (independente do intervalo de inferência de
rastreamento, que se auto-ajusta) e só processa os módulos atualmente ativos — módulos desligados
têm custo zero.

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

## Login e segurança

### Login

A aplicação exige autenticação antes de exibir qualquer tela do sistema. Como o projeto **não usa
banco de dados nem backend por enquanto**, o login é uma credencial única, fixa, validada
inteiramente no navegador:

- **Usuário (e-mail):** `zanfaust@gmail.com`
- **Senha:** `QxNCgQ6ESk872RXT`

A sessão dura 8 horas e fica em `sessionStorage` (some ao fechar a aba/janela). Há um botão **SAIR**
no painel de controle para encerrar a sessão manualmente a qualquer momento.

Para trocar a senha, gere um novo par salt/hash e cole os três valores em
`src/services/authService.ts` (`AUTHORIZED_EMAIL`, `CREDENTIAL_SALT`, `CREDENTIAL_HASH`):

```bash
node scripts/generate-auth-hash.mjs seu-email@dominio.com "sua-nova-senha"
```

### O que isso protege — e o que **não** protege

Sendo direto sobre o limite real disso: **é um portão de acesso local, não um sistema de
autenticação de verdade.** Com "sem banco de dados por enquanto" como restrição, não existe servidor
para guardar segredo algum — tudo roda no navegador de quem está na frente da tela. Concretamente:

- A senha nunca é comparada nem guardada em texto puro: é validada como hash SHA-256 salgado
  (`crypto.subtle.digest`, API nativa do navegador), então abrir o código-fonte não revela a senha
  diretamente.
- Tentativas de login erradas são limitadas com backoff exponencial (5 tentativas livres, depois
  bloqueios crescentes de 15s até 5min), guardado em `localStorage` para sobreviver a recarregamentos
  — dificulta ataques de força bruta feitos pela própria UI.
- **Mas**: qualquer pessoa com acesso ao DevTools do navegador pode inspecionar o JS já carregado,
  alterar o estado do React em memória, ou simplesmente chamar a função que libera o acesso — porque
  não existe nenhum servidor do outro lado verificando nada. Isso não é um bug corrigível sem
  backend; é a natureza de qualquer "login" 100% client-side. Trate como uma trava de gaveta, não
  como um cofre: impede acesso casual (alguém pegando o notebook), não um atacante determinado que já
  tem acesso à máquina.
- Se no futuro for necessário um controle de acesso real (múltiplos usuários, revogação de sessão,
  proteção contra quem tem acesso físico ao navegador), a única forma correta é um backend que
  valide as credenciais e emita tokens que o cliente não consiga forjar.

### Outras medidas de segurança revisadas

- **Content-Security-Policy** (`index.html`) restringe scripts, conexões e mídia a `'self'` mais os
  dois hosts do CDN do MediaPipe (`cdn.jsdelivr.net`, `storage.googleapis.com`); bloqueia `object-src`,
  `base-uri` e `form-action` de origens externas.
- **Sem `dangerouslySetInnerHTML`, `eval`, `innerHTML` ou `document.write`** em nenhum lugar do
  código — toda a renderização passa pelo JSX do React ou pela Canvas API, não há vetor de XSS via
  conteúdo dinâmico.
- **Dependência do MediaPipe fixada em versão exata** (`@mediapipe/tasks-vision@0.10.14`, não
  `latest`), reduzindo o risco de uma atualização upstream maliciosa ou quebrada ser puxada sem
  aviso.
- **`localStorage`/`sessionStorage` só guardam preferências de UI e o estado de autenticação** —
  nunca imagem, vídeo, landmark facial/de mão ou qualquer dado biométrico (ver `interactionStore.ts`,
  que persiste explicitamente apenas `{ allowMultiple, quality, options }`).
- `npm audit`: 1 vulnerabilidade moderada, no `esbuild`/`vite` (servidor de desenvolvimento apenas,
  não afeta o build de produção nem é exposta pelo app publicado). Corrigível com
  `npm audit fix --force`, mas isso instala Vite 8 (breaking change) — decisão deliberadamente
  deixada para quando o projeto for atualizado com testes de regressão.

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

### Limitações dos módulos de interação

- **"Voltada para a câmera" e distância são heurísticas**: como o MediaPipe Hand Landmarker não
  expõe pose 3D verdadeira, orientação da palma (Holographic Shield) e a leve "inclinação" do
  escudo usam o sinal/magnitude do componente Z relativo dos landmarks — funcionam bem na prática,
  mas não são uma reconstrução 3D real.
- **Gesture Hacking** implementa 2 dos 7 tipos de desafio sugeridos (sequência por toque e scanner
  de palma), alternados por nível com dificuldade progressiva, em vez dos 7 simultaneamente — para
  manter o minijogo enxuto e testável.
- **Motion Echo** ecoa mãos (esqueleto completo) e cabeça (ponto da testa); não há rastreamento de
  corpo/braços neste projeto (só rosto + mãos), então a opção "corpo completo" do pedido original
  não se aplica.
- **Virtual Objects e Telekinesis mantêm conjuntos de objetos independentes** — por design, para
  manter os módulos desacoplados um objeto "telecinético" não é o mesmo objeto arrastável do
  Virtual Objects.
- **Sensibilidade/confirmação/suavização (Options)** afetam a classificação de gestos e o
  amortecimento dos landmarks; a maioria dos módulos também usa seus próprios limiares internos
  (ex. abertura mínima da mão, raio de alcance) ajustados empiricamente, não expostos na UI.
- Assim como o restante do app, os módulos foram validados neste ambiente com câmera sintética do
  Chrome (sem mão/rosto reais): confirmamos que cada um ativa/desativa sem erros de console, limpa
  seu estado corretamente e coexiste com os demais mesmo em stress test com os 10 simultâneos —
  mas a precisão fina de cada gesto (ex. threshold de pinça, círculo do Air Portal) só pode ser
  validada com uma webcam física.
