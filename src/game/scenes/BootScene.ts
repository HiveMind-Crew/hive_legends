import Phaser from 'phaser';
import { generateTextures } from '../textures';
import { TEXTURE_SPECS } from '../textureSpecs';

/**
 * Boot: load any drop-in art overrides listed in public/art/manifest.json,
 * validate their dimensions against TEXTURE_SPECS, then generate programmer
 * art for every key that wasn't overridden. Artists ship art by adding
 * `public/art/<texture-key>.png` and listing the key in the manifest — zero
 * code changes (see docs/ART.md).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    this.load.json('art-manifest', 'art/manifest.json');
  }

  create(): void {
    const manifest = this.cache.json.get('art-manifest') as unknown;
    const keys = Array.isArray(manifest)
      ? manifest.filter((k): k is string => typeof k === 'string' && k in TEXTURE_SPECS)
      : [];
    if (Array.isArray(manifest) && keys.length !== manifest.length) {
      console.warn('[art] manifest entries without a matching texture key were ignored');
    }
    if (keys.length === 0) {
      this.finish();
      return;
    }
    for (const key of keys) this.load.image(key, `art/${key}.png`);
    this.load.once('complete', () => this.finish());
    this.load.start();
  }

  private finish(): void {
    // Reject overrides with wrong dimensions so art mistakes surface
    // immediately instead of rendering subtly broken.
    for (const [key, spec] of Object.entries(TEXTURE_SPECS)) {
      if (!this.textures.exists(key)) continue;
      const src = this.textures.get(key).getSourceImage();
      if (src.width !== spec.w || src.height !== spec.h) {
        console.warn(
          `[art] override "${key}" is ${src.width}x${src.height}, expected ${spec.w}x${spec.h} — using generated art instead`
        );
        this.textures.remove(key);
      }
    }
    generateTextures(this);
    this.scene.start('hero-select');
  }
}
