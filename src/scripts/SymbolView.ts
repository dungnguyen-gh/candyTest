// SymbolView.ts

import { Container, Sprite, Texture, Graphics } from 'pixi.js';
import { EXPLODE_MS, SYMBOL_H, SYMBOL_W } from './constants';
import { tween, easeInCubic, easeOutCubic } from './utils/tween';

export class SymbolView extends Container {
  private _sprite: Sprite;
  private _highlight: Graphics;
  public type: string;

  constructor(type: string, texture: Texture) {
    super();
    this.type = type;

    // sprite
    this._sprite = new Sprite(texture);
    this._sprite.anchor.set(0.5);
    this._sprite.x = SYMBOL_W * 0.5;
    this._sprite.y = SYMBOL_H * 0.5;
    this.addChild(this._sprite);

    // highlight border (thicker)
    this._highlight = new Graphics();
    this._highlight.lineStyle(10, 0xffff00);
    this._highlight.drawRect(0, 0, SYMBOL_W, SYMBOL_H);
    this._highlight.endFill();
    this._highlight.visible = false;
    this.addChild(this._highlight);
  }

  setTexture(type: string, texture: Texture) {
    this.type = type;
    this._sprite.texture = texture;
  }

  setHighlight(on: boolean) {
    this._highlight.visible = on;
    if (on) {
      this._highlight.alpha = 1;
      this._highlight.scale.set(1);
    }
  }

  private async animateHighlightExplosion(): Promise<void> {
    const h = this._highlight;
    // expand + fade highlight while keeping sprite intact
    await tween((t) => {
      const k = easeOutCubic(t);
      h.scale.set(1 + k * 2); // pop outward
      h.alpha = 1 - k;
    }, EXPLODE_MS);
  }

  /**
   * Explode animation: highlight pops out (visual), sprite shrinks & fades.
   * Note: this.visible will be set false at the end, caller should recycle/destroy.
   */
  async explode(): Promise<void> {
    const highlightP = this._highlight.visible ? this.animateHighlightExplosion() : Promise.resolve();

    const spriteP = tween((t) => {
      const k = easeOutCubic(t);
      this._sprite.scale.set(1 - k); // shrink
      this._sprite.alpha = 1 - k;    // fade
    }, EXPLODE_MS);

    await Promise.all([highlightP, spriteP]);

    // cleanup state; caller should remove/release this instance
    this._highlight.visible = false;
    this.visible = false;
  }

  async dropTo(targetY: number, duration: number): Promise<void> {
    this.setHighlight(false);
    const startY = this.y;
    await tween((t) => {
      this.y = startY + (targetY - startY) * t;
    }, duration, easeInCubic);
    this.y = targetY;
    this.visible = true;
    this.alpha = 1;
    this._sprite.scale.set(1);
  }
}
