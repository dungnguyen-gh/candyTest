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

    // main sprite
    this._sprite = new Sprite(texture);
    this._sprite.anchor.set(0.5);
    this._sprite.x = SYMBOL_W * 0.5;
    this._sprite.y = SYMBOL_H * 0.5;
    this.addChild(this._sprite);

    // highlight square (hidden by default)
    this._highlight = new Graphics();
    this._highlight.lineStyle(10, 0xffff00); // thick yellow border
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

  async explode(): Promise<void> {
    const highlight = this._highlight;

    // Highlight "pop outward" effect
    if (highlight.visible) {
      tween((t) => {
        const k = easeOutCubic(t);
        highlight.scale.set(1 + k * 2); // expand outward ~120%
        highlight.alpha = 1 - k;          // fade away
      }, EXPLODE_MS);
    }

    // Symbol keeps its shrink + fade 
    const startScale = 1;
    const endScale = 0;
    const startAlpha = 1;
    await tween((t) => {
      const k = easeOutCubic(t);
      this._sprite.scale.set(startScale + (endScale - startScale) * k);
      this._sprite.alpha = startAlpha * (1 - k);
    }, EXPLODE_MS);

    // cleanup
    highlight.visible = false;
    this.visible = false;
  }

  async dropTo(targetY:number, duration:number): Promise<void> {
    this.setHighlight(false);
    const startY = this.y;
    await tween((t)=>{
      this.y = startY + (targetY - startY) * t;
    }, duration, easeInCubic);
    this.y = targetY;
    this.visible = true;
    this.alpha = 1;
    this._sprite.scale.set(1);
  }
}
