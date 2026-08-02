import { useEffect, useMemo, useRef } from 'react';
import { interactionStore, useInteractionState } from '../store/interactionStore';
import { createEnergyOrbModule } from '../modules/energyOrb';
import { createHolographicShieldModule } from '../modules/holographicShield';
import { createGestureMenuModule } from '../modules/gestureMenu';
import { createVirtualObjectsModule } from '../modules/virtualObjects';
import { createTelekinesisModule } from '../modules/telekinesis';
import { createEnergyPulseModule } from '../modules/energyPulse';
import { createParticleFieldModule } from '../modules/particleField';
import { createAirPortalModule } from '../modules/airPortal';
import { createGestureHackingModule } from '../modules/gestureHacking';
import { createMotionEchoModule } from '../modules/motionEcho';
import type { InteractionModule, ModuleId } from '../types/modules';

function createAllModules(): Record<ModuleId, InteractionModule> {
  return {
    energyOrb: createEnergyOrbModule(),
    holographicShield: createHolographicShieldModule(),
    gestureMenu: createGestureMenuModule(),
    virtualObjects: createVirtualObjectsModule(),
    telekinesis: createTelekinesisModule(),
    energyPulse: createEnergyPulseModule(),
    particleField: createParticleFieldModule(),
    airPortal: createAirPortalModule(),
    gestureHacking: createGestureHackingModule(),
    motionEcho: createMotionEchoModule(),
  };
}

/**
 * Owns the single instance of every interaction module and binds the store's module
 * on/off flags to their real activate()/deactivate() lifecycle. Returns only the
 * modules that are currently enabled, in activation order, for the render loop to
 * update()/render() — everything else is fully paused (no update, no render, no cost).
 */
export function useInteractionModules() {
  const state = useInteractionState();
  const modulesRef = useRef<Record<ModuleId, InteractionModule> | null>(null);
  if (!modulesRef.current) modulesRef.current = createAllModules();
  const modules = modulesRef.current;

  useEffect(() => {
    interactionStore.bindModuleLifecycle((id, enabled) => {
      const mod = modules[id];
      if (enabled) mod.activate();
      else mod.deactivate();
    });
  }, [modules]);

  useEffect(
    () => () => {
      (Object.values(modules) as InteractionModule[]).forEach((m) => {
        if (m.enabled) m.deactivate();
      });
    },
    [modules],
  );

  const activeModules = useMemo(
    () =>
      (Object.keys(modules) as ModuleId[])
        .filter((id) => state.modules[id])
        .map((id) => modules[id]),
    [modules, state.modules],
  );

  return { modules, activeModules };
}
