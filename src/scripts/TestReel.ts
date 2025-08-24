


// old reel
// Reel.ts
import { BlurFilter, Container, Graphics, Texture, Ticker } from 'pixi.js';
import { BOARD_TOP, COLS, DROP_MS, SYMBOL_H, SYMBOL_W } from './constants';
import { SymbolView } from './SymbolView';
import { tweenTo, backout } from './utils/tween';

type TextureMap = Record<string, Texture>;

export class Reel extends Container {
  public index: number;
  private rows: number;
  private textures: TextureMap;
  private _symbols: SymbolView[] = [];
  private blur = new BlurFilter();

  // reel animation state
  public curPosition = 0;   // <-- our custom reel position
  private prevPosition = 0;

  constructor(index:number, rows:number, textures:TextureMap, startTypes:string[]) {
    super();
    this.index = index;
    this.rows = rows;
    this.textures = textures;

    this.x = ((COLS * SYMBOL_W) >= 900 ? (900 - COLS * SYMBOL_W) / 2 : 0) + index * SYMBOL_W;
    this.y = BOARD_TOP;

    // mask
    const mask = new Graphics();
    mask.beginFill(0x000000);
    mask.drawRect(0, 0, SYMBOL_W, rows * SYMBOL_H);
    mask.endFill();
    this.addChild(mask);
    this.mask = mask;

    // initial column
    for (let r = 0; r < rows; r++) {
      const sv = new SymbolView(startTypes[r], this.textures[startTypes[r]]);
      sv.x = 0;
      sv.y = r * SYMBOL_H;
      this._symbols.push(sv);
      this.addChild(sv);
    }

    // update every frame
    Ticker.shared.add(this.update, this);
  }

  private update() {
    if (!this.filters?.length) return; // only animate while blur active

    this.blur.blurY = (this.curPosition - this.prevPosition) * 8;
    this.prevPosition = this.curPosition;

    for (let i = 0; i < this._symbols.length; i++) {
      const s = this._symbols[i];
      const prevY = s.y;
      s.y = ((this.curPosition + i) % this._symbols.length) * SYMBOL_H - SYMBOL_H;

      if (s.y < 0 && prevY > SYMBOL_H) {
        const keys = Object.keys(this.textures);
        const randomKey = keys[(Math.random() * keys.length) | 0];
        s.setTexture(randomKey, this.textures[randomKey]);
      }
    }
  }

  async startSpin(staggerMs:number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.filters = [this.blur];
        this.curPosition = 0;
        this.prevPosition = 0;

        const extra = Math.floor(Math.random() * 3);
        const target = this.curPosition + 10 + this.index * 5 + extra;
        const time = 2500 + this.index * 600 + extra * 600;

        // tween our custom curPosition
        tweenTo(this, 'curPosition', target, time, backout(0.3), null, () => {
          resolve();
        });
      }, staggerMs);
    });
  }

  async stopWithColumn(types: string[]): Promise<void> {
    return new Promise(resolve => {
        // add a tiny stagger (so stop is sequential from left to right)
      setTimeout(() => {
        for (let r = 0; r < this.rows; r++) {
          const s = this._symbols[r];
          s.y = r * SYMBOL_H;
          s.setTexture(types[r], this.textures[types[r]]);
          s.visible = true;
          s.alpha = 1;
          s.scale.set(1);
        }
        // disable blur
        this.filters = [];
        this.blur.blurY = 0;
        resolve();
      }, this.index * 300);
    });
  }

  getTypeAt(row:number): string { return this._symbols[row]?.type; }
  getSymbolAt(row:number): SymbolView | undefined { return this._symbols[row]; }

  async explodeRows(rowsToExplode:number[]): Promise<number> {
    const promises: Promise<void>[] = [];
    for (const r of rowsToExplode) {
      const s = this._symbols[r];
      if (s && s.visible) promises.push(s.explode());
    }
    await Promise.all(promises);
    return promises.length;
  }

  async dropAndRefill(refillTypes:string[]): Promise<void> {
    const keep: SymbolView[] = [];
    for (let r=this.rows-1; r>=0; r--){
      const s = this._symbols[r];
      if (s?.visible) keep.unshift(s);
    }
    const missing = this.rows - keep.length;

    for (let i=0;i<missing;i++){
      const type = refillTypes[i];
      const sv = new SymbolView(type, this.textures[type]);
      sv.x = 0;
      sv.y = -(i+1)*SYMBOL_H;
      sv.visible = true;
      this.addChild(sv);
      keep.unshift(sv);
    }
    this._symbols = keep;

    const drops: Promise<void>[] = [];
    this._symbols.forEach((s, row)=>{
      drops.push(s.dropTo(row * SYMBOL_H, DROP_MS));
    });
    await Promise.all(drops);
  }
}
