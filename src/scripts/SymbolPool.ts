// SymbolPool.ts

import { Texture } from 'pixi.js';
import { SymbolView } from './SymbolView';

/**
 * Object pool for SymbolView.
 * Not stored by type — a pooled SymbolView is re-skinned on get().
 */
export class SymbolPool {
  private stash: SymbolView[] = []; // Array of unused SymbolView

  get(type: string, texture: Texture): SymbolView {
    // If stash has something - reuse from stash
    // Else init new one
    const sv = this.stash.pop() ?? new SymbolView(type, texture); 

    // detach from previous parent if any
    if (sv.parent) sv.parent.removeChild(sv);

    // re-skin and reset visual state
    sv.setTexture(type, texture);
    sv.visible = true;
    sv.alpha = 1;
    sv.scale.set(1);
    sv.setHighlight(false);
    sv.y = 0; // caller will position

    return sv;
  }

  release(sv: SymbolView) {
    // detach from parent container and reset
    if (sv.parent) sv.parent.removeChild(sv);
    // reset state
    sv.setHighlight(false);
    sv.visible = false;
    sv.alpha = 0;
    sv.scale.set(1);
    this.stash.push(sv); // push back into stash
  }

  size(): number { return this.stash.length; }
  clear(): void { this.stash.length = 0; }
}

export const symbolPool = new SymbolPool();
