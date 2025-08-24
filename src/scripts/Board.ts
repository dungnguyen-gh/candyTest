// Board.ts

import { Container, Texture } from 'pixi.js';
import { COLS, REEL_STAGGER_MS, ROWS, SYMBOL_TYPES, WILD } from './constants';
import { Reel } from './Reel';
import { findClusters, Cluster } from './clusterUtils';

type TextureMap = Record<string, Texture>;
//export type Cluster = { type:string; cells:[number,number][] }; // [row,col]

export class Board extends Container {
  reels: Reel[] = [];

  constructor(textures: TextureMap, firstMatrix: string[][]) {
    super();
    // build reels (columns)
    for (let c=0;c<COLS;c++){
      const colTypes: string[] = [];
      for (let r=0;r<ROWS;r++){
        colTypes.push(firstMatrix[r][c]);
      }
      const reel = new Reel(c, ROWS, textures, colTypes);
      this.addChild(reel);
      this.reels.push(reel);
    }
  }

  async spinStart(): Promise<void> {
    // left to right stagger, wait for each other
    //const tasks = this.reels.map((r, i)=>r.startSpin(i*REEL_STAGGER_MS));
    //await Promise.all(tasks);

    // fire all spins, don’t wait for each
    this.reels.forEach((r, i) => r.startSpin(i * REEL_STAGGER_MS));
  }

  async spinStop(matrix: string[][]): Promise<void> {
    // stop from left to right with stagger (column types derived from matrix rows)
    for (let c=0;c<COLS;c++){
      const col: string[] = [];
      for (let r=0;r<ROWS;r++) col.push(matrix[r][c]);
      await this.reels[c].stopWithColumn(col);
      // small stagger effect naturally from awaiting each reel
    }
  }

  snapshotTypes(): string[][] {
    const m: string[][] = Array.from({length:ROWS}, ()=>
        Array(COLS).fill(''));
    for (let r=0;r<ROWS;r++){
      for (let c=0;c<COLS;c++){
        m[r][c] = this.reels[c].getTypeAt(r);
      }
    }
    return m;
  }

    /** K is wildcard: can join any cluster of a **non-K** type but cannot start a cluster itself */
    findClusters(minSize = 4): Cluster[] {
        return findClusters(this.snapshotTypes(), minSize);
    }

    async explode(clusters: Cluster[]): Promise<number> {
        if (!clusters.length) return 0;

        // Step 1: highlight all cluster symbols
        for (const cl of clusters) {
            for (const [r, c] of cl.cells) {
            const s = this.reels[c].getSymbolAt(r);
            if (s) s.setHighlight(true);
            }
        }

        // small pause so player can see highlights before explode
        await new Promise(res => setTimeout(res, 1000));

        // Step 2: group rows by column for efficient reel calls
        const byCol: Map<number, number[]> = new Map();
        for (const cl of clusters) {
            for (const [r, c] of cl.cells) {
            if (!byCol.has(c)) byCol.set(c, []);
            byCol.get(c)!.push(r);
            }
        }

        const tasks: Promise<number>[] = [];
        for (const [c, rows] of byCol) {
            const uniq = [...new Set(rows)].sort((a, b) => a - b);
            tasks.push(this.reels[c].explodeRows(uniq));
        }

        const explodedCounts = await Promise.all(tasks);

        // Step 3: clear highlights after explosion
        for (const reel of this.reels) {
            for (let r = 0; r < reel['rows']; r++) {
            const s = reel.getSymbolAt(r);
            if (s) s.setHighlight(false);
            }
        }

        return explodedCounts.reduce((a, b) => a + b, 0);
    }


  /** Drop existing symbols and refill with provided columns (top→down list of *new* types per column) */
  async dropAndRefill(refillColumns: string[][]): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (let c=0;c<COLS;c++) {
      tasks.push(this.reels[c].dropAndRefill(refillColumns[c] || []));
    }
    await Promise.all(tasks);
  }
}
