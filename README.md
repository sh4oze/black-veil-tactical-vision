# BLACK VEIL — Tactical Vision System

**© 2026 Magno A. Frutuoso. Todos os direitos reservados.** Este repositório é disponibilizado
publicamente para fins de portfólio e demonstração; visualização pública não concede nenhuma
licença de uso, cópia, modificação ou redistribuição do código. Veja [LICENSE](./LICENSE).

BLACK VEIL é uma experiência visual interativa com estética militar, obscura e futurista, construída
sobre rastreamento de rosto e mãos em tempo real pela câmera do navegador. Todo o processamento —
inferência do MediaPipe, suavização, reconhecimento de gestos e renderização — acontece inteiramente
no lado do cliente: não há backend, não há chave de API paga, e nenhuma imagem, vídeo ou dado
biométrico é gravado, armazenado ou enviado a qualquer servidor. O único tráfego de rede além do
próprio bundle são os arquivos de modelo do MediaPipe, baixados uma vez de um CDN público e depois
cacheados pelo navegador.

## Como rodar

Pré-requisitos: Node.js 18+.

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite (por padrão `http://localhost:5173`). A aplicação pede login antes
de qualquer outra tela — veja as credenciais e o porquê disso na seção [Login e segurança](#login-e-segurança).
Depois de autenticado, a câmera só é solicitada quando você clica em **INICIAR SISTEMA**; em outra
máquina na rede (não `localhost`), o navegador só libera `getUserMedia` sob HTTPS ou um túnel
(ngrok, Tailscale Funnel etc.), já que câmera exige contexto seguro.

```bash
npm run build     # build de produção (tsc -b && vite build)
npm run preview   # serve o build de produção localmente
npm run lint      # apenas checagem de tipos (tsc --noEmit)
```

## Stack e arquitetura geral

O projeto é React 18 + Vite + TypeScript, com `@mediapipe/tasks-vision` fornecendo o `FaceLandmarker`
e o `HandLandmarker` (WASM, com delegate de GPU e fallback automático para CPU). Toda a parte visual
— mira, moldura facial, esqueleto de mãos, HUD, módulos de interação — é desenhada em Canvas 2D, sem
WebGL; os efeitos sonoros são sintetizados via Web Audio API (osciladores, sem arquivos de áudio) e
começam desativados por padrão. `CameraStage` concentra o ciclo de vida da câmera e um único loop de
inferência que se auto-ajusta (25–90ms) conforme o tempo de processamento medido; os resultados vivem
em `useRef`, não em estado do React, então nada força um re-render a cada frame — só o HUD recebe
atualizações agrupadas periodicamente. Cada overlay (`FaceOverlay`, `HandSkeletonOverlay`,
`InteractionModulesLayer`) mantém seu próprio canvas e seu próprio `requestAnimationFrame`, todos
lendo o mesmo resultado de rastreamento para evitar inferência duplicada.

A mira reage ao status do rosto (procurando / detectando / travado / perdido, com histerese para não
piscar em falhas de um frame só) e escala com a distância aparente do rosto. O esqueleto das mãos
distingue esquerda/direita corretamente apesar do espelhamento do vídeo, e um classificador de forma
simples (distâncias entre landmarks, não um modelo treinado) reconhece mão aberta, punho fechado,
apontar, sinal de paz, polegar para cima, pinça e duas mãos levantadas — cada gesto passa por um
estabilizador com janela de frames e cooldown antes de contar como confirmado, para evitar flicker.
Erros de câmera (permissão negada, dispositivo inexistente, navegador incompatível, contexto
inseguro, falha ao carregar os modelos) têm mensagens específicas na tela, e todos os controles
(câmera, som, HUD, mira, esqueleto, tela cheia, troca de câmera) afetam o estado real, não só a
exibição — desligar o rastreamento de rosto ou mão, por exemplo, pausa a inferência correspondente.

## Módulos de interação

Além do rastreamento base, existem onze módulos opcionais e independentes — todos desligados por
padrão, ativados pelo painel **MÓDULOS** ou pelo Gesture Menu. Por padrão só um fica ativo por vez
(ativar um desliga o anterior), a menos que **ALLOW MULTIPLE MODULES** esteja ligado no painel de
**CONFIG**. Nenhum módulo roda inferência própria: todos consomem o mesmo `TrackingContext` montado
uma vez por frame por `InteractionModulesLayer`, e cada um implementa a interface `InteractionModule`
(`activate/update/render/reset/deactivate`), com `reset()` limpando partículas, objetos e timers
imediatamente ao desligar — sem estado vazando entre ativações.

Os módulos giram em torno de algumas famílias de gesto. **Energy Orb**, **Telekinesis** e **Virtual
Objects** são de manipulação: o primeiro forma uma esfera de plasma (paleta branco-quente → laranja
→ vermelho) entre as duas palmas abertas, que carrega com os punhos fechados e libera uma onda de
partículas ao reabrir rápido; o segundo faz objetos flutuarem e serem arremessados com a velocidade
real do gesto; o terceiro oferece seis primitivas holográficas, cada uma com cor própria, que podem
ser pinçadas, arrastadas, escaladas com duas mãos e encaixadas em zonas de dock. **Holographic
Shield** e **Air Portal** lidam com portais/barreiras controlados por gesto — o portal, em especial,
só abre depois que você desenha um círculo real no ar (validado pela trajetória do dedo, não uma pose
única) e depois se agarra e redimensiona por pinça, do mesmo jeito que o Energy Orb usa a distância
entre as mãos para definir tamanho. **Energy Pulse** e **Gesture Hacking** são mais reflexo/minijogo:
mira e pinça disparam um pulso contra um alvo holográfico com pontuação e precisão; o outro alterna
entre tocar nós em sequência e segurar a palma sobre um "scanner", com timer e ACCESS GRANTED/DENIED.
**Particle Field**, **Motion Echo** e **Phantom Flame** são mais ambientais: um campo de partículas
que repele, atrai e forma vórtices conforme a mão; ecos translúcidos e defasados do esqueleto e da
cabeça; e chamas procedurais nas mãos que reagem à velocidade do movimento.

O mesmo painel de **CONFIG** também controla, à parte dos módulos: qualidade visual (Low/Medium/High/
Ultra/Automatic, afetando densidade de partículas e efeitos secundários), sensibilidade e tempo de
confirmação de gesto, suavização do rastreamento, feedback por voz (via `SpeechSynthesis` nativo do
navegador) e landmarks de debug. Só preferências de UI (qualidade, sensibilidade, opções) são salvas
em `localStorage` — o estado de quais módulos estão ligados nunca é persistido, por design: tudo
volta a desligado a cada recarregamento.

Fora dos módulos, a mira ganhou uma opção de **auto-disparo**: quando ela trava (vermelha) na testa,
dispara um projétil não-teleguiado de uma origem fixa na base da tela; o acerto ou erro é resolvido
contra onde o alvo realmente está no instante em que o projétil chega, então sair de perto a tempo
conta como escape.

## Login e segurança

Como o projeto não usa banco de dados nem backend por enquanto, o acesso é protegido por uma
credencial única, validada inteiramente no navegador (a credencial em si não é publicada aqui).

A sessão dura 8 horas em `sessionStorage` (some ao fechar a aba) e pode ser encerrada a qualquer
momento pelo botão **SAIR**. A senha nunca é comparada em texto puro — é validada como hash SHA-256
salgado via `crypto.subtle.digest` — e tentativas erradas sofrem bloqueio com backoff exponencial.
Dito isso, vale ser direto sobre o limite real disso: sem um servidor para guardar segredo algum,
isto é um portão de acesso local, não autenticação de verdade — qualquer pessoa com DevTools consegue
inspecionar o JS e burlar a checagem. Trate como uma trava de gaveta (impede acesso casual), não como
um cofre. Para trocar a senha, gere um novo hash com `node scripts/generate-auth-hash.mjs
<email> <senha>` e cole os três valores resultantes em `src/services/authService.ts`.

O restante da superfície de segurança foi revisado com o mesmo espírito: um `Content-Security-Policy`
em `index.html` restringe scripts, conexões e mídia a `'self'` mais os dois hosts do CDN do
MediaPipe; não há `innerHTML`, `eval` ou `dangerouslySetInnerHTML` em nenhum lugar do código; a
dependência do MediaPipe está fixada em versão exata (não `latest`); e `localStorage`/`sessionStorage`
nunca guardam nada além de preferências de UI e o estado de autenticação — jamais imagem, vídeo ou
landmark. Um `npm audit` aponta uma vulnerabilidade moderada no `esbuild`/`vite` (servidor de
desenvolvimento apenas, não afeta o build publicado), deixada para uma futura atualização de major
do Vite.

## Limitações conhecidas

Distância, gestos e confiança são estimativas geométricas simples sobre os landmarks — não
biometria real nem reconhecimento de identidade, e isso é intencional. O rastreamento facial é
limitado a um rosto por vez (mãos suportam até duas); a primeira carga depende de rede para baixar
os modelos do MediaPipe; e navegadores sem aceleração de GPU caem automaticamente para o delegate de
CPU, mais lento porém funcional. Algumas heurísticas de orientação 3D (como a "palma voltada para a
câmera" do Holographic Shield) usam o componente Z relativo dos landmarks, que não é uma
reconstrução 3D verdadeira — funciona na prática, mas é sensível a iluminação e ângulo de câmera.
Todo o sistema foi validado neste ambiente de desenvolvimento com Playwright e uma câmera sintética
do Chrome (sem mão/rosto reais): confirma-se que cada módulo ativa, desativa e coexiste com os
demais sem erros de console, mas a precisão fina de cada gesto — limiares de abertura de mão, raio
de pinça, circularidade do Air Portal — só pôde ser calibrada e validada com uma webcam física.
