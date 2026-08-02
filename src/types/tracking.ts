export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D extends Point2D {
  z: number;
}

export type FaceStatus = 'searching' | 'detecting' | 'tracked' | 'lost';

export type Handedness = 'Left' | 'Right';

export type GestureType =
  | 'none'
  | 'open_palm'
  | 'closed_fist'
  | 'pointing'
  | 'peace_sign'
  | 'thumbs_up'
  | 'pinch';

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceTrackingResult {
  status: FaceStatus;
  landmarks: Point3D[] | null;
  foreheadPoint: Point2D | null;
  boundingBox: FaceBoundingBox | null;
  confidence: number;
  /** Normalized metric (inter-ocular distance) used to scale the reticle with apparent distance. */
  sizeMetric: number;
}

export interface TrackedHand {
  handedness: Handedness;
  landmarks: Point3D[];
  confidence: number;
  gesture: GestureType;
  /** 0..1 fade opacity, ramps down after the hand disappears instead of popping out. */
  opacity: number;
}

export interface HandTrackingResult {
  hands: TrackedHand[];
  bothHandsRaised: boolean;
}

export type CameraStatus = 'idle' | 'starting' | 'active' | 'error';

export interface CameraErrorInfo {
  type: 'denied' | 'not_found' | 'unsupported' | 'insecure' | 'other';
  message: string;
}

export interface CameraStatusInfo {
  status: CameraStatus;
  error: CameraErrorInfo | null;
  facingMode: 'user' | 'environment';
  canSwitchFacing: boolean;
}

export interface HandTelemetry {
  handedness: Handedness;
  gesture: GestureType;
  confidence: number;
}

export interface Telemetry {
  faceStatus: FaceStatus;
  faceConfidence: number;
  facesCount: number;
  handsCount: number;
  hands: HandTelemetry[];
  bothHandsRaised: boolean;
  fps: number;
  inferenceIntervalMs: number;
}

export interface LogEntry {
  id: number;
  text: string;
  time: number;
}
