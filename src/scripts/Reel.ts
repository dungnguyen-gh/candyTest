// Reel.ts

import { BlurFilter, Container, Graphics, Texture, Ticker } from 'pixi.js';
import { BOARD_TOP, COLS, DROP_MS, SYMBOL_H, SYMBOL_W, USE_POOL } from './constants';
import { SymbolView } from './SymbolView';
import { tweenTo, backout } from './utils/tween';
import { symbolPool } from './SymbolPool';

type TextureMap = Record<string, Texture>;
type ReelState = 'idle' | 'spinning' | 'stopping';

export class Reel extends Container {
  public index: number;
  private _rows: number;
  private textures: TextureMap;
  private _symbols: (SymbolView | undefined)[] = [];
  private blur = new BlurFilter();

  private state: ReelState = 'idle';
  public curPosition = 0;
  private prevPosition = 0;

  private readonly SPIN_SPEED = 0.3 + Math.random() * 0.1;
  private readonly STOP_EXTRA_SPINS = 6;
  private readonly STOP_TIME_MS = 900;

  private randomizeOnWrap = false;

  constructor(index: number, rows: number, textures: TextureMap, startTypes: string[]) {
    super();
    this.index = index;
    this._rows = rows;
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
      const sv = USE_POOL
        ? symbolPool.get(startTypes[r], this.textures[startTypes[r]])
        : new SymbolView(startTypes[r], this.textures[startTypes[r]]);
      sv.x = 0;
      sv.y = r * SYMBOL_H;
      this._symbols[r] = sv;
      this.addChild(sv);
    }

    Ticker.shared.add(this.update, this);
  }

  private update(delta: number) {
    if (this.state !== 'spinning' && this.state !== 'stopping') return;

    if (this.state === 'spinning') {
      this.curPosition += this.SPIN_SPEED * delta;
    }

    this.blur.blurY = (this.curPosition - this.prevPosition) * 8;
    this.prevPosition = this.curPosition;

    const n = this._symbols.length;
    for (let i = 0; i < n; i++) {
      const s = this._symbols[i];
      if (!s) continue;

      const prevY = s.y;
      s.y = ((this.curPosition + i) % n) * SYMBOL_H - SYMBOL_H;

      if (this.randomizeOnWrap && s.y < 0 && prevY > SYMBOL_H) {
        const keys = Object.keys(this.textures);
        const randomKey = keys[(Math.random() * keys.length) | 0];
        s.setTexture(randomKey, this.textures[randomKey]);
      }
    }
  }

  async startSpin(staggerMs: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.filters = [this.blur];
        this.state = 'spinning';
        this.randomizeOnWrap = true;
        this.prevPosition = this.curPosition;
        resolve();
      }, staggerMs);
    });
  }

  async stopWithColumn(types: string[]): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.state = 'stopping';
        this.randomizeOnWrap = false;

        const extra = this.STOP_EXTRA_SPINS + this.index;
        const finalTarget = Math.ceil(this.curPosition) + extra;

        tweenTo(this, 'curPosition', finalTarget, this.STOP_TIME_MS, backout(0.2), undefined, () => {
          this.curPosition = Math.ceil(this.curPosition);
          this.prevPosition = this.curPosition;

          for (let r = 0; r < this._rows; r++) {
            let s = this._symbols[r];
            if (!s) {
              s = USE_POOL
                ? symbolPool.get(types[r], this.textures[types[r]])
                : new SymbolView(types[r], this.textures[types[r]]);
              this._symbols[r] = s;
              this.addChild(s);
            }
            s.y = r * SYMBOL_H;
            s.setTexture(types[r], this.textures[types[r]]);
            s.visible = true;
            s.alpha = 1;
            s.scale.set(1);
          }

          this.filters = [];
          this.blur.blurY = 0;
          this.state = 'idle';
          resolve();
        });
      }, this.index * 300);
    });
  }

  getTypeAt(row: number): string { return this._symbols[row]?.type ?? ''; }
  getSymbolAt(row: number): SymbolView | undefined { return this._symbols[row]; }

  async explodeRows(rowsToExplode: number[]): Promise<number> {
    const tasks: Promise<void>[] = [];

    for (const r of rowsToExplode) {
      const s = this._symbols[r];
      if (!s || !s.visible) continue;

      tasks.push((async () => {
        await s.explode();
        // return to pool or destroy
        if (USE_POOL) {
          symbolPool.release(s);
        } else {
          s.destroy();
        }
        this._symbols[r] = undefined; // mark gap in reel
      })());
    }

    await Promise.all(tasks);
    return tasks.length;
  }

  async dropAndRefill(refillTypes: string[]): Promise<void> {
    
    // symbols are not exploded and never pooled
    const survivors: { s: SymbolView; row: number }[] = [];

    // collect survivors
    for (let r = 0; r < this._rows; r++) {
      const s = this._symbols[r];
      if (s && s.visible) {
        survivors.push({ s, row: r });
      }
    }

    // missing symbols
    const missing = this._rows - survivors.length;
    const newOnTop: SymbolView[] = [];

    // create new symbols for missing
    for (let i = 0; i < missing; i++) {
      const type = refillTypes[i];
      const sv = USE_POOL
        ? symbolPool.get(type, this.textures[type])
        : new SymbolView(type, this.textures[type]);
      sv.x = 0;
      sv.y = -(i + 1) * SYMBOL_H; // spawn above reel
      this.addChild(sv);
      newOnTop.unshift(sv); // stack so first goes on top
    }

    // rebuild column (new ones at top, then survivors in order)
    const newColumn = [...newOnTop, ...survivors.map(x => x.s)];
    this._symbols = new Array(this._rows);

    // animate drop
    const drops: Promise<void>[] = [];
    newColumn.forEach((s, row) => {
      this._symbols[row] = s;
      drops.push(s.dropTo(row * SYMBOL_H, DROP_MS));
    });

    await Promise.all(drops);
  }
}
