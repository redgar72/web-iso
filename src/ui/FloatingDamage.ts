import * as THREE from 'three';

const FLOATING_DAMAGE_DURATION = 0.9;
const FLOATING_DAMAGE_FLOAT_HEIGHT = 0.8;

interface FloatingHit {
  worldPos: THREE.Vector3;
  amount: number;
  spawnTime: number;
  el: HTMLDivElement;
}

/**
 * Creates a floating damage number system: world-space hit positions are projected
 * to screen, float up and fade. Mounts a container into the given parent.
 * getGameTime is called when a hit is shown so spawn time is correct.
 */
export function createFloatingDamage(
  parent: HTMLElement,
  getGameTime: () => number
): {
  show: (worldPos: THREE.Vector3, amount: number, color?: string) => void;
  update: (camera: THREE.Camera, canvasWidth: number, canvasHeight: number, gameTime: number) => void;
} {
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;inset:0;z-index:5;pointer-events:none;';
  parent.appendChild(container);

  const hits: FloatingHit[] = [];
  const projectionVec = new THREE.Vector3();

  function show(worldPos: THREE.Vector3, amount: number, color = '#fff'): void {
    const gameTime = getGameTime();
    const el = document.createElement('div');
    el.textContent = String(amount);
    el.style.cssText = `position:absolute;left:0;top:0;font:bold 18px sans-serif;color:${color};text-shadow:0 0 2px #000,0 1px 3px #000;white-space:nowrap;transform:translate(-50%,-50%);will-change:transform,opacity;`;
    container.appendChild(el);
    hits.push({
      worldPos: worldPos.clone(),
      amount,
      spawnTime: gameTime,
      el,
    });
  }

  function update(
    camera: THREE.Camera,
    cw: number,
    ch: number,
    gameTime: number
  ): void {
    for (let i = hits.length - 1; i >= 0; i--) {
      const hit = hits[i];
      const age = gameTime - hit.spawnTime;
      if (age >= FLOATING_DAMAGE_DURATION) {
        container.removeChild(hit.el);
        hits.splice(i, 1);
        continue;
      }
      const t = age / FLOATING_DAMAGE_DURATION;
      const floatY = (age / FLOATING_DAMAGE_DURATION) * FLOATING_DAMAGE_FLOAT_HEIGHT;
      projectionVec.set(hit.worldPos.x, hit.worldPos.y + floatY, hit.worldPos.z);
      projectionVec.project(camera);
      const px = (projectionVec.x * 0.5 + 0.5) * cw;
      const py = (1 - (projectionVec.y * 0.5 + 0.5)) * ch;
      hit.el.style.left = `${px}px`;
      hit.el.style.top = `${py}px`;
      hit.el.style.opacity = String(1 - t);
    }
  }

  return { show, update };
}
