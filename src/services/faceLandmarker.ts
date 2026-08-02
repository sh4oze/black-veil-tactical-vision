import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Public, free MediaPipe assets (no API key, no billing). Pinned to match the
// @mediapipe/tasks-vision package version so wasm and JS stay in sync.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let instance: FaceLandmarker | null = null;
let loadingPromise: Promise<FaceLandmarker> | null = null;

async function create(delegate: 'GPU' | 'CPU'): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

/** Lazily loads and caches a single shared FaceLandmarker instance, falling back to CPU if GPU init fails. */
export async function getFaceLandmarker(): Promise<FaceLandmarker> {
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

export function disposeFaceLandmarker(): void {
  instance?.close();
  instance = null;
}
