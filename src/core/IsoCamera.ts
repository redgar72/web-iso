import * as THREE from 'three';

/**
 * Diablo 2 Resurrected–style isometric camera.
 * Orthographic projection with fixed angle; position/zoom can be changed for pan/zoom.
 */
const ISO_ANGLE = Math.PI / 6;   // ~30° elevation from horizontal
const ISO_AZIMUTH = Math.PI / 4; // 45° rotation around Y (classic iso)

export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  private _zoom = 1;
  private _worldFocus = new THREE.Vector3(0, 0, 0);
  private _distance = 24;
  private _width: number;
  private _height: number;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    const aspect = width / height;
    const frustumSize = 20;
    this.camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      1000
    );
    this.updatePosition();
  }

  get three(): THREE.OrthographicCamera {
    return this.camera;
  }

  setZoom(z: number): void {
    this._zoom = Math.max(0.2, Math.min(4, z));
    this.camera.zoom = this._zoom;
    this.camera.updateProjectionMatrix();
  }

  getZoom(): number {
    return this._zoom;
  }

  setWorldFocus(x: number, y: number, z: number): void {
    this._worldFocus.set(x, y, z);
    this.updatePosition();
  }

  getWorldFocus(): THREE.Vector3 {
    return this._worldFocus.clone();
  }

  setDistance(d: number): void {
    this._distance = Math.max(8, Math.min(64, d));
    this.updatePosition();
  }

  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    const aspect = width / height;
    const frustumSize = 20;
    this.camera.left = (-frustumSize * aspect) / 2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = -frustumSize / 2;
    this.camera.zoom = this._zoom;
    this.camera.updateProjectionMatrix();
  }

  private updatePosition(): void {
    const d = this._distance;
    this.camera.position.set(
      this._worldFocus.x + d * Math.cos(ISO_ANGLE) * Math.sin(ISO_AZIMUTH),
      this._worldFocus.y + d * Math.sin(ISO_ANGLE),
      this._worldFocus.z + d * Math.cos(ISO_ANGLE) * Math.cos(ISO_AZIMUTH)
    );
    this.camera.lookAt(this._worldFocus);
    this.camera.updateProjectionMatrix();
  }
}
