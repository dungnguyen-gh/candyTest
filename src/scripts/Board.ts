// Board.ts

import { Container, Text, TextStyle, Texture } from 'pixi.js';
import { COLS, DEBUG_UI, REEL_STAGGER_MS, ROWS } from './constants';
import { Reel } from './Reel';
import { findClusters, Cluster } from './clusterUtils';
import { symbolPool } from './SymbolPool';

type TextureMap = Record<string, Texture>;

export class Board extends Container {
  reels: Reel[] = [];
  private debugText?: Text;

  constructor(textures: TextureMap, firstMatrix: string[][]) {
    super();

    for (let c = 0; c < COLS; c++) {
      const colTypes: string[] = [];
      for (let r = 0; r < ROWS; r++) colTypes.push(firstMatrix[r][c]);
      const reel = new Reel(c, ROWS, textures, colTypes);
      this.addChild(reel);
      this.reels.push(reel);
    }

    if (DEBUG_UI) {
      const style = new TextStyle({
        fontFamily: 'Arial',
        fontSize: 16,
        fill: 0xffffff,
        stroke: 0x000000,
        strokeThickness: 3,
      });
      this.debugText = new Text('Pool: 0', style);
      this.debugText.x = 5;
      this.debugText.y = 5;
      this.addChild(this.debugText);
      this.updateDebug();
    }
  }

  private updateDebug() {
    if (this.debugText) this.debugText.text = `Pool: ${symbolPool.size()}`;
  }

  async spinStart(): Promise<void> {
    this.reels.forEach((r, i) => r.startSpin(i * REEL_STAGGER_MS));
  }

  async spinStop(matrix: string[][]): Promise<void> {
    for (let c = 0; c < COLS; c++) {
      const col: string[] = [];
      for (let r = 0; r < ROWS; r++) col.push(matrix[r][c]);
      await this.reels[c].stopWithColumn(col);
    }
    this.updateDebug();
  }

  snapshotTypes(): string[][] {
    const m: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(''));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        m[r][c] = this.reels[c].getTypeAt(r);
      }
    }
    return m;
  }

  findClusters(minSize = 4): Cluster[] {
    return findClusters(this.snapshotTypes(), minSize);
  }

  clearAllHighlights() {
    for (const reel of this.reels) {
      for (let r = 0; r < ROWS; r++) {
        const s = reel.getSymbolAt(r);
        if (s) s.setHighlight(false);
      }
    }
  }

  async explode(clusters: Cluster[]): Promise<number> {
    if (!clusters.length) return 0;

    // show highlights
    for (const cl of clusters) {
      for (const [r, c] of cl.cells) {
        const s = this.reels[c].getSymbolAt(r);
        if (s) s.setHighlight(true);
      }
    }

    await new Promise(res => setTimeout(res, 500));

    // explode per column
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

    this.clearAllHighlights();
    this.updateDebug();

    return explodedCounts.reduce((a, b) => a + b, 0);
  }

  async dropAndRefill(refillColumns: string[][]): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (let c = 0; c < COLS; c++) {
      tasks.push(this.reels[c].dropAndRefill(refillColumns[c] || []));
    }
    await Promise.all(tasks);
    this.updateDebug();
  }

  getMissingPerColumn(): number[] {
    const counts: number[] = [];
    for (let c = 0; c < COLS; c++) {
      let missing = 0;
      for (let r = 0; r < ROWS; r++) {
        const s = this.reels[c].getSymbolAt(r);
        if (!s || !s.visible) missing++;
      }
      counts[c] = missing;
    }
    return counts;
  }
}
