/**
 * Rangoli Rush — a seated, hands-first mixed-reality rangoli puzzle.
 * Built with the Immersive Web SDK (IWSDK) for Meta Quest.
 */
import { World, VisibilityState } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { RangoliGame } from './game/game.js';
import { sfx } from './game/audio.js';

const overlay = document.getElementById('overlay') as HTMLDivElement | null;
const enterBtn = document.getElementById('enter-xr') as HTMLButtonElement | null;
const browserBtn = document.getElementById('play-browser') as HTMLButtonElement | null;
const status = document.getElementById('xr-status') as HTMLDivElement | null;

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions)
  .then(async (world) => {
    world.registerSystem(RangoliGame);
    (window as any).__world = world;
    (window as any).__sfx = sfx;

    let supported = false;
    try {
      supported = !!(await navigator.xr?.isSessionSupported('immersive-ar'));
      if (!supported) supported = !!(await navigator.xr?.isSessionSupported('immersive-vr'));
    } catch {
      supported = false;
    }
    if (enterBtn) {
      enterBtn.disabled = !supported;
      enterBtn.textContent = supported ? 'Enter Mixed Reality' : 'Headset not detected';
      enterBtn.onclick = () => {
        sfx.ensure();
        world.launchXR();
      };
    }
    if (status) status.textContent = supported ? 'Hands only · seated · ~5 minute sessions' : 'Open on Meta Quest Browser, or play here with your mouse.';
    if (browserBtn) {
      browserBtn.onclick = () => {
        sfx.ensure();
        overlay?.classList.add('hidden');
      };
    }
    world.visibilityState.subscribe((s) => {
      if (s === VisibilityState.NonImmersive) overlay?.classList.remove('hidden');
      else overlay?.classList.add('hidden');
    });
    document.body.classList.add('ready');
  })
  .catch((err) => {
    console.error('Rangoli Rush failed to start', err);
    if (status) status.textContent = 'Could not start: ' + (err?.message ?? err);
  });
