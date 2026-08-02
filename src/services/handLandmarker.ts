import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let instance: HandLandmarker | null = null;
let loadingPromise: Promise<HandLandmarker> | null = null;

async function create(delegate: 'GPU' | 'CPU'): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

/** Lazily loads and caches a single shared HandLandmarker instance, falling back to CPU if GPU init fails. */
export async function getHandLandmarker(): Promise<HandLandmarker> {
  if (instance) return instance;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      instance = await create('GPU');
    } catch {
      instance = await create('CPU');
    }
    return instance;
  })();
  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

export function disposeHandLandmarker(): void {
  instance?.close();
  instance = null;
}
