import * as THREE from 'three';
import {
  CHUNK_SIZE,
  tileIndexXZ64,
  WATER_SURFACE_Y_WORLD,
  type LevelChunkV1,
} from '../../shared/levelChunk';
import { TILE_SIZE } from './IsoTerrain';

const EPS_Y = 0.006;

function createSharedWaterMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a7a9c,
    metalness: 0.12,
    roughness: 0.22,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    emissive: new THREE.Color(0x061a22),
    emissiveIntensity: 0.35,
  });
  mat.side = THREE.DoubleSide;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -0.5;
  mat.polygonOffsetUnits = -0.5;
  mat.toneMapped = true;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    (mat as THREE.MeshStandardMaterial & { userData: { waterShader?: typeof shader } }).userData.waterShader =
      shader;

    shader.vertexShader = `uniform float uTime;\nvarying vec2 vWaterXZ;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      vec3 transformed = vec3( position );
      float sx = transformed.x * 0.55;
      float sz = transformed.z * 0.52;
      float nx = sin(sz * 1.1 + uTime * 1.9);
      float nz = cos(sx * 1.05 + uTime * 1.7);
      transformed.y += (nx * nz) * 0.038;
      `
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `
      #include <worldpos_vertex>
      vWaterXZ = worldPosition.xz;
      `
    );

    shader.fragmentShader = `uniform float uTime;\nvarying vec2 vWaterXZ;\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float fx = vViewPosition.x * 0.018 + uTime * 0.08;
      float fz = vViewPosition.z * 0.018 - uTime * 0.06;
      float caust = sin(fx) * cos(fz) * 0.055 + 0.96;
      diffuseColor.rgb *= caust;
      // Flow toward -Z (south); sin(k*z + w*t) drifts south as t increases.
      float flowK = 4.85;
      float flowW = 1.35;
      float southBands = sin(vWaterXZ.z * flowK + uTime * flowW);
      float southDetail = sin(vWaterXZ.z * flowK * 2.7 + vWaterXZ.x * 1.4 + uTime * flowW * 0.92) * 0.28;
      float flowShade = southBands * 0.5 + southDetail + 0.52;
      diffuseColor.rgb *= mix(0.88, 1.1, flowShade);
      `
    );
  };

  return mat;
}

let sharedWaterMaterial: THREE.MeshStandardMaterial | null = null;

export function getSharedWaterMaterial(): THREE.MeshStandardMaterial {
  if (!sharedWaterMaterial) sharedWaterMaterial = createSharedWaterMaterial();
  return sharedWaterMaterial;
}

export function setSharedWaterTime(seconds: number): void {
  const mat = sharedWaterMaterial;
  if (!mat) return;
  const shader = (
    mat as THREE.MeshStandardMaterial & { userData: { waterShader?: { uniforms: { uTime: { value: number } } } } }
  ).userData.waterShader;
  if (shader?.uniforms.uTime) shader.uniforms.uTime.value = seconds;
}

/**
 * Flat water surface at {@link WATER_SURFACE_Y_WORLD} (+ epsilon), one merged mesh per chunk.
 */
export function buildChunkWaterSurfaceMesh(chunk: LevelChunkV1): THREE.Mesh | null {
  if (!chunk.water) return null;

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let vertBase = 0;

  const pushQuad = (x0: number, z0: number, x1: number, z1: number): void => {
    const y = WATER_SURFACE_Y_WORLD + EPS_Y;
    positions.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    for (let i = 0; i < 4; i++) {
      normals.push(0, 1, 0);
    }
    indices.push(vertBase, vertBase + 1, vertBase + 2, vertBase, vertBase + 2, vertBase + 3);
    vertBase += 4;
  };

  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      if (!chunk.water[tileIndexXZ64(lx, lz)]) continue;
      const x0 = lx * TILE_SIZE;
      const z0 = lz * TILE_SIZE;
      pushQuad(x0, z0, x0 + TILE_SIZE, z0 + TILE_SIZE);
    }
  }

  if (positions.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setIndex(indices);
  geom.computeBoundingSphere();

  const mesh = new THREE.Mesh(geom, getSharedWaterMaterial());
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.renderOrder = 12;
  return mesh;
}
