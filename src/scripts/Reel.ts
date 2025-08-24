// Reel.ts
import { BlurFilter, Container, Graphics, Texture, Ticker } from 'pixi.js';
import { BOARD_TOP, COLS, DROP_MS, SYMBOL_H, SYMBOL_W } from './constants';
import { SymbolView } from './SymbolView';
import { tweenTo, backout } from './utils/tween';

type TextureMap = Record<string, Texture>;

type ReelState = 'idle' | 'spinning' | 'stopping';

export class Reel extends Container {
  public index: number;
  private rows: number;
  private textures: TextureMap;
  private _symbols: SymbolView[] = [];
  private blur = new BlurFilter();

  // motion state
  private state: ReelState = 'idle';
  public curPosition = 0;     // in "symbols"
  private prevPosition = 0;

  // spin feel
  private readonly SPIN_SPEED = 0.3 + Math.random() * 0.1;       // symbols per frame @60fps (tweak)
  private readonly STOP_EXTRA_SPINS = 6;    // how many extra symbols to travel before easing to stop
  private readonly STOP_TIME_MS = 900;      // deceleration duration

  // whether to pick random textures when a symbol wraps from bottom->top
  private randomizeOnWrap = false;

  constructor(index:number, rows:number, textures:TextureMap, startTypes:string[]) {
    super();
    this.index = index;
    this.rows = rows;
    this.textures = textures;

    // position
    this.x = ((COLS * SYMBOL_W) >= 900 ? (900 - COLS * SYMBOL_W) / 2 : 0) + index * SYMBOL_W;
    this.y = BOARD_TOP;

    // mask
    const mask = new Graphics();
    mask.beginFill(0x000000);
    mask.drawRect(0, 0, SYMBOL_W, rows * SYMBOL_H);
    mask.endFill();
    this.addChild(mask);
    this.mask = mask;

    // initial symbols
    for (let r = 0; r < rows; r++) {
      const sv = new SymbolView(startTypes[r], this.textures[startTypes[r]]);
      sv.x = 0;
      sv.y = r * SYMBOL_H;
      this._symbols.push(sv);
      this.addChild(sv);
    }

    // per-frame update (spin + stop)
    Ticker.shared.add(this.update, this);
  }

  // --- per-frame ---
  private update(delta: number) {
    const active = this.state === 'spinning' || this.state === 'stopping';
    if (!active) return;

    // advance position during free spin; during stop, curPosition is driven by tweenTo
    if (this.state === 'spinning') {
      this.curPosition += this.SPIN_SPEED * delta;
    }

    // blur strength based on velocity
    this.blur.blurY = (this.curPosition - this.prevPosition) * 8;
    this.prevPosition = this.curPosition;

    // layout symbols relative to curPosition
    const n = this._symbols.length;
    for (let i = 0; i < n; i++) {
      const s = this._symbols[i];
      const prevY = s.y;
      s.y = ((this.curPosition + i) % n) * SYMBOL_H - SYMBOL_H;

      // only randomize while truly spinning (not while easing to stop)
      if (this.randomizeOnWrap && s.y < 0 && prevY > SYMBOL_H) {
        const keys = Object.keys(this.textures);
        const randomKey = keys[(Math.random() * keys.length) | 0];
        s.setTexture(randomKey, this.textures[randomKey]);
      }
    }
  }

  // --- phase 1: start continuous spin ---
  async startSpin(staggerMs:number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        this.filters = [this.blur];
        this.state = 'spinning';
        this.randomizeOnWrap = true;
        // keep curPosition continuous; no hard reset to avoid visual pop
        // if you prefer, uncomment this:
        // this.curPosition = Math.ceil(this.curPosition);
        this.prevPosition = this.curPosition;
        resolve();
      }, staggerMs);
    });
  }

  // --- phase 2: decelerate and lock the server column ---
  async stopWithColumn(types: string[]): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => {
        // enter stopping phase; keep updating positions while tween runs
        this.state = 'stopping';
        this.randomizeOnWrap = false; // no more random swaps while easing

        // land on a clean boundary with a few extra spins for a satisfying stop
        const extra = this.STOP_EXTRA_SPINS + this.index; // slightly more for later reels
        const finalTarget = Math.ceil(this.curPosition) + extra;

        tweenTo(
          this,
          'curPosition',
          finalTarget,
          this.STOP_TIME_MS,
          backout(0.2),
          // on change: nothing required, update() uses curPosition every frame
          undefined,
          // on complete:
          () => {
            // snap to exact boundary
            this.curPosition = Math.ceil(this.curPosition);
            this.prevPosition = this.curPosition;

            // lock final server symbols
            for (let r = 0; r < this.rows; r++) {
              const s = this._symbols[r];
              s.y = r * SYMBOL_H;
              s.setTexture(types[r], this.textures[types[r]]);
              s.visible = true;
              s.alpha = 1;
              s.scale.set(1);
            }

            // stop visuals
            this.filters = [];
            this.blur.blurY = 0;
            this.state = 'idle';
            resolve();
          }
        );
      }, this.index * 300); // stop order L->R with 0.3s gaps
    });
  }

  // unchanged:
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
    for (let r = this.rows - 1; r >= 0; r--){
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
      drops.push(s.dropTo(row * SYMBOL_H, DROP_MS)); // easeInCubic in SymbolView gives accelerating free-fall
    });
    await Promise.all(drops);
  }
}
