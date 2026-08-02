import type { VideoFrameMapping } from '../utils/coordinates';
import type { FaceTrackingResult, Handedness, HandTrackingResult, Point2D, Point3D } from './tracking';

export type ModuleId =
  | 'energyOrb'
  | 'holographicShield'
  | 'gestureMenu'
  | 'virtualObjects'
  | 'telekinesis'
  | 'energyPulse'
  | 'particleField'
  | 'airPortal'
  | 'gestureHacking'
  | 'motionEcho';

export const MODULE_IDS: ModuleId[] = [
  'energyOrb',
  'holographicShield',
  'gestureMenu',
  'virtualObjects',
  'telekinesis',
  'energyPulse',
  'particleField',
  'airPortal',
  'gestureHacking',
  'motionEcho',
];

export const MODULE_LABELS: Record<ModuleId, string> = {
  energyOrb: 'ENERGY ORB',
  holographicShield: 'HOLOGRAPHIC SHIELD',
  gestureMenu: 'GESTURE MENU',
  virtualObjects: 'VIRTUAL OBJECTS',
  telekinesis: 'TELEKINESIS',
  energyPulse: 'ENERGY PULSE',
  particleField: 'PARTICLE FIELD',
  airPortal: 'AIR PORTAL',
  gestureHacking: 'GESTURE HACKING',
  motionEcho: 'MOTION ECHO',
};

export type QualitySetting = 'low' | 'medium' | 'high' | 'ultra' | 'auto';
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface ResolvedQuality {
  level: QualityLevel;
  /** Multiplies particle counts / sample density. */
  particleMultiplier: number;
  /** Gates expensive secondary effects (blur glow, distortion, extra rings). */
  effectsEnabled: boolean;
}

export interface HandHistorySample {
  t: number;
  landmarks: Point3D[];
}

/**
 * Per-frame data shared by every interaction module. Built once per render tick by
 * InteractionModulesLayer from the same face/hand results CameraStage already computed —
 * no module runs its own MediaPipe inference.
 */
export interface TrackingContext {
  time: number;
  dt: number;
  face: FaceTrackingResult;
  hands: HandTrackingResult;
  handHistory: ReadonlyMap<Handedness, HandHistorySample[]>;
  canvasWidth: number;
  canvasHeight: number;
  mapping: VideoFrameMapping;
  toCanvas: (nx: number, ny: number) => Point2D;
  quality: ResolvedQuality;
  /** 0..1, from Options > Gesture Sensitivity. */
  sensitivity: number;
  /** ms a gesture must hold before confirming, from Options > Gesture Confirmation Time. */
  confirmationMs: number;
  soundEnabled: boolean;
}

export interface InteractionModule {
  readonly id: ModuleId;
  readonly label: string;
  enabled: boolean;
  activate(): void;
  update(context: TrackingContext): void;
  render(ctx: CanvasRenderingContext2D, context: TrackingContext): void;
  reset(): void;
  deactivate(): void;
}
