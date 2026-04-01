import * as THREE from 'three';

/**
 * Third-person perspective camera orbiting the character (RS-style: keys rotate view,
 * not the character).
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly _target = new THREE.Vector3(0, 0, 0);
  /** Horizontal angle (rad): direction from player to camera on the XZ plane (+Z = 0). */
  private _orbitYaw = 0;
  private _distance = 14;
  private _minDistance = 5;
  private _maxDistance = 48;
  /** Elevation angle above horizontal (radians). */
  private _pitch = 0.42;
  /** World Y for `lookAt` (chest / head height). */
  private _lookHeight = 1.35;
  private _width: number;
  private _height: number;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    const aspect = width / Math.max(height, 1e-6);
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.25, 800);
    this.camera.up.set(0, 1, 0);
    this.updatePosition();
  }

  get three(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /** Keep the camera aimed at the player's feet / origin Y; orbit angles are separate. */
  setTarget(x: number, y: number, z: number): void {
    this._target.set(x, y, z);
    this.updatePosition();
  }

  setDistance(d: number): void {
    this._distance = THREE.MathUtils.clamp(d, this._minDistance, this._maxDistance);
    this.updatePosition();
  }

  addDistanceDelta(delta: number): void {
    this.setDistance(this._distance + delta);
  }

  addOrbitYaw(deltaRadians: number): void {
    this._orbitYaw += deltaRadians;
    this.updatePosition();
  }

  addPitch(deltaRadians: number): void {
    this._pitch = THREE.MathUtils.clamp(this._pitch + deltaRadians, 0.12, 1.15);
    this.updatePosition();
  }

  setPitch(radians: number): void {
    this._pitch = THREE.MathUtils.clamp(radians, 0.12, 1.15);
    this.updatePosition();
  }

  setLookHeight(h: number): void {
    this._lookHeight = Math.max(0.4, h);
    this.updatePosition();
  }

  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    const aspect = width / Math.max(height, 1e-6);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.updatePosition();
  }

  private updatePosition(): void {
    const flat = this._distance * Math.cos(this._pitch);
    const h = this._distance * Math.sin(this._pitch);
    const camX = this._target.x + Math.sin(this._orbitYaw) * flat;
    const camY = this._target.y + h;
    const camZ = this._target.z + Math.cos(this._orbitYaw) * flat;
    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(this._target.x, this._target.y + this._lookHeight, this._target.z);
  }
}
