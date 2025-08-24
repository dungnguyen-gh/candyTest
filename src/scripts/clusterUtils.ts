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

      // temporary tracking
      const stack: [number, number][] = [[r, c]];
      const cells: [number, number][] = [];
      const wildCells: [number, number][] = [];
      const tempVisited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
      let baseCount = 0;

      tempVisited[r][c] = true;

      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        const t = grid[cr][cc];

        if (t === base) {
          cells.push([cr, cc]);
          baseCount++;
        } else if (t === WILD) {
          wildCells.push([cr, cc]);
        }

        for (const [dr, dc] of dirs) {
          const nr = cr + dr, nc = cc + dc;
          if (!inBounds(nr, nc)) continue;
          if (tempVisited[nr][nc] || visited[nr][nc]) continue;

          const nt = grid[nr][nc];
          if (nt === base || nt === WILD) {
            tempVisited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }

      // validate
      const clusterSize = cells.length + wildCells.length;
      if (clusterSize >= minSize && baseCount > 0) {
        const fullCluster = [...cells, ...wildCells];
        clusters.push({ type: base, cells: fullCluster });

        // now commit visited globally
        for (const [rr, cc] of fullCluster) visited[rr][cc] = true;
      }
    }
  }

  return clusters;
}
