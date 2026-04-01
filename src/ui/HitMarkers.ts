import * as THREE from 'three';
import type { MultiplayerHitSplatSink } from '../net/MultiplayerClient';

export interface HitMarkerOverlay {
  createHitMarker(
    position: THREE.Vector3,
    amount: number,
    opts?: { shareWithPeers?: boolean; remotePeer?: boolean }
  ): void;
  createPlayerHitMarker(position: THREE.Vector3, amount: number): void;
  updateHitMarkers(currentTime: number, camera: THREE.Camera, cw: number, ch: number): void;
}

interface HitMarker {
  element: HTMLDivElement;
  worldPosition: THREE.Vector3;
  spawnTime: number;
  amount: number;
  offsetY: number;
}

const HIT_MARKER_DURATION = 1.0;
const HIT_MARKER_FLOAT_DISTANCE = 1.5;
const HIT_MARKER_Y_OFFSET = 1.5;

const HIT_SPLAT_STYLE_SELF = {
  color: '#ff4444',
  textShadow: '0 0 8px rgba(255, 68, 68, 0.8), 0 2px 4px rgba(0, 0, 0, 0.8)',
};

const HIT_SPLAT_STYLE_PEER = {
  color: '#8a5555',
  textShadow: '0 0 4px rgba(60, 35, 35, 0.45), 0 1px 3px rgba(0, 0, 0, 0.78)',
};

export function createHitMarkerOverlay(
  parent: HTMLElement,
  deps: { getMultiplayerClient: () => MultiplayerHitSplatSink | null }
): HitMarkerOverlay {
  const hitMarkersContainer = document.createElement('div');
  hitMarkersContainer.style.cssText = 'position:absolute;inset:0;z-index:5;pointer-events:none;';
  parent.appendChild(hitMarkersContainer);

  const hitMarkers: HitMarker[] = [];
  const projectionVec = new THREE.Vector3();

  function createHitMarker(
    position: THREE.Vector3,
    amount: number,
    opts?: { shareWithPeers?: boolean; remotePeer?: boolean }
  ): void {
    const remotePeer = opts?.remotePeer === true;
    const st = remotePeer ? HIT_SPLAT_STYLE_PEER : HIT_SPLAT_STYLE_SELF;
    const element = document.createElement('div');
    element.textContent = Math.round(amount).toString();
    element.style.cssText = `
    position: absolute;
    font: bold 20px/1 sans-serif;
    color: ${st.color};
    text-shadow: ${st.textShadow};
    white-space: nowrap;
    pointer-events: none;
    transform: translate(-50%, -50%);
    will-change: transform, opacity;
  `;
    hitMarkersContainer.appendChild(element);

    hitMarkers.push({
      element,
      worldPosition: position.clone(),
      spawnTime: performance.now() / 1000,
      amount,
      offsetY: 0,
    });

    if (opts?.shareWithPeers === true) {
      const client = deps.getMultiplayerClient();
      if (client !== null) {
        client.sendHitSplat(position.x, position.y, position.z, amount);
      }
    }
  }

  function createPlayerHitMarker(position: THREE.Vector3, amount: number): void {
    createHitMarker(position, amount, { shareWithPeers: true });
  }

  function updateHitMarkers(currentTime: number, camera: THREE.Camera, cw: number, ch: number): void {
    for (let i = hitMarkers.length - 1; i >= 0; i--) {
      const marker = hitMarkers[i];
      const age = currentTime - marker.spawnTime;

      if (age >= HIT_MARKER_DURATION) {
        hitMarkersContainer.removeChild(marker.element);
        hitMarkers.splice(i, 1);
        continue;
      }

      const progress = age / HIT_MARKER_DURATION;
      marker.offsetY = HIT_MARKER_FLOAT_DISTANCE * progress;

      const opacity = 1.0 - progress;
      marker.element.style.opacity = opacity.toString();

      projectionVec.set(
        marker.worldPosition.x,
        marker.worldPosition.y + HIT_MARKER_Y_OFFSET + marker.offsetY,
        marker.worldPosition.z
      );
      projectionVec.project(camera);

      const px = (projectionVec.x * 0.5 + 0.5) * cw;
      const py = (1 - (projectionVec.y * 0.5 + 0.5)) * ch;

      if (projectionVec.z < 1) {
        marker.element.style.left = `${px}px`;
        marker.element.style.top = `${py}px`;
        marker.element.style.visibility = 'visible';
      } else {
        marker.element.style.visibility = 'hidden';
      }
    }
  }

  return { createHitMarker, createPlayerHitMarker, updateHitMarkers };
}
