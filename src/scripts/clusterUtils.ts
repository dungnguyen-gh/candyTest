// clusterUtils.ts

import { COLS, ROWS, WILD } from './constants';

export type Cluster = { type: string; cells: [number, number][] }; // [row,col]

/**
 * Find clusters in a grid of symbols.
 * - Wilds (WILD) can join clusters but cannot start them.
 * - Cluster must be >= minSize.
 */
export function findClusters(grid: string[][], minSize = 4): Cluster[] {
  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const clusters: Cluster[] = [];

  const inBounds = (r: number, c: number) =>
    r >= 0 && r < ROWS && c >= 0 && c < COLS;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (visited[r][c]) continue;
      const base = grid[r][c];
      if (base === WILD) continue; // wild cannot start

      const stack: [number, number][] = [[r, c]];
      const cells: [number, number][] = [];
      visited[r][c] = true; // only the base type is visited

      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        cells.push([cr, cc]);

        for (const [dr, dc] of dirs) {
          const nr = cr + dr, nc = cc + dc;
          if (!inBounds(nr, nc)) continue;
          if (visited[nr][nc] && grid[nr][nc] !== WILD) continue;

          const t = grid[nr][nc];
          if (t === base || t === WILD) {
            if (t !== WILD) visited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }

      if (cells.length >= minSize) {
        clusters.push({ type: base, cells });
      }
    }
  }

  return clusters;
}
