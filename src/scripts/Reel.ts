// Reel.ts
import { BlurFilter, Container, Graphics, Texture, Ticker } from 'pixi.js';
import { BOARD_TOP, COLS, DROP_MS, SYMBOL_H, SYMBOL_W, USE_POOL } from './constants';
import { SymbolView } from './SymbolView';
import { tweenTo, backout } from './utils/tween';
import { symbolPool } from './SymbolPool';

type TextureMap = Record<string, Texture>;
type ReelState = 'idle' | 'spinning' | 'stopping'; // manage reel state

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

    // mask for visible window
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

    // bind update
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
      }, this.index * 300); //delay between reels
    });
  }

  // Return the type 
  getTypeAt(row: number): string {
    const s = this._symbols[row];
    return (s && s.visible) ? s.type : '';
  }

  getSymbolAt(row: number): SymbolView | undefined {
    return this._symbols[row];
  }

  
  // Explode the given rows. After animation - release to pool (if enabled) or destroy
  async explodeRows(rowsToExplode: number[]): Promise<number> {
    const tasks: Promise<void>[] = [];

    for (const r of rowsToExplode) {
      const s = this._symbols[r];
      if (!s) continue;

      tasks.push(
        s.explode().then(() => {
          // release/destroy and clear slot immediately so board snapshots see it empty
          if (USE_POOL) {
            symbolPool.release(s); // return to pool
          } else {
            if (s.parent) s.parent.removeChild(s);
            s.destroy({ children: true, texture: false, baseTexture: false });
          }
          this._symbols[r] = undefined; // logical slot
        })
      );
    }

    await Promise.all(tasks);
    return tasks.length;
  }


  /**
   * Drop and refill — collapse survivors downward (apply gravity)
   * - survivors are gathered from top to bottom and then placed below newly-created top items
   * - refillTypes is top-down
   */
  async dropAndRefill(refillTypes: string[]): Promise<void> {
    // collect survivors
    const survivors: SymbolView[] = [];

    for (let r = 0; r < this._rows; r++) {
      const s = this._symbols[r];
      if (s) {
        // if a symbol exists but is invisible (exploded but not yet released), release it now
        if (!s.visible) {
          if (USE_POOL) symbolPool.release(s);
          else s.destroy({ children: true, texture: false, baseTexture: false });
          this._symbols[r] = undefined;
          continue;
        }
        // visible survivor
        survivors.push(s);
      }
      // reassign when composing new column
      this._symbols[r] = undefined;
    }
    // missing rows
    const missing = this._rows - survivors.length;
    const newOnTop: SymbolView[] = [];

    // create new symbols for missing slots
    const keys = Object.keys(this.textures);
    for (let i = 0; i < missing; i++) {
      const type = refillTypes[i] ?? keys[(Math.random() * keys.length) | 0];
      const sv = USE_POOL ? symbolPool.get(type, this.textures[type]) : new SymbolView(type, this.textures[type]);

      sv.x = 0;
      sv.y = -(i + 1) * SYMBOL_H; // spawn above visible window
      sv.visible = true;
      sv.alpha = 1;
      sv.scale.set(1);
      sv.setHighlight(false);
      this.addChild(sv);

      // put on top - add to beginning
      newOnTop.unshift(sv); 
    }

    // rebuild the order
    const newColumn = [...newOnTop, ...survivors];

    // make sure fill any remaining slots with random symbols
    while (newColumn.length < this._rows) {
      const type = keys[(Math.random() * keys.length) | 0];
      const sv = USE_POOL ? symbolPool.get(type, this.textures[type]) : new SymbolView(type, this.textures[type]);
      sv.x = 0;
      sv.y = -SYMBOL_H;
      sv.visible = true;
      sv.alpha = 1;
      sv.scale.set(1);
      this.addChild(sv);
      newColumn.unshift(sv);
    }

    newColumn.length = this._rows;

    // commit to internal slots and animate drop for every symbol to its row
    this._symbols = new Array(this._rows);
    const drops: Promise<void>[] = [];
    newColumn.forEach((s, row) => {
      this._symbols[row] = s;
      s.visible = true;
      s.alpha = 1;
      s.scale.set(1);
      s.setHighlight(false);
      drops.push(s.dropTo(row * SYMBOL_H, DROP_MS));
    });

    await Promise.all(drops);
  }

}
