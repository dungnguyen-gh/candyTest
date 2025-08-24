// clusterUtils.ts
import { COLS, ROWS, WILD } from './constants';

export type Cluster = { type: string; cells: [number, number][] }; // [row,col]

/**
 * Find clusters in a grid of symbols.
 * - Wilds (WILD) can join clusters but cannot start them.
 * - Cluster must be greater than minSize.
 */
export function findClusters(grid: string[][], minSize = 4): Cluster[] {
  const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]]; // move directions
  const clusters: Cluster[] = []; // result

  const inBounds = (r: number, c: number) =>
    r >= 0 && r < ROWS && c >= 0 && c < COLS;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (visited[r][c]) continue;

      const base = grid[r][c];
      // skip empty slots and wild start
      if (!base || base === WILD) continue;

      // flood fill for this base symbol - DFS search
      const stack: [number, number][] = [[r, c]]; // find connected symbols
      const cells: [number, number][] = []; // position of base
      const wildCells: [number, number][] = []; // position of wild
      const tempVisited: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false)); // avoid re visited
      tempVisited[r][c] = true;
      let baseCount = 0;

      while (stack.length) {
        const [cr, cc] = stack.pop()!; // pop one cell
        const t = grid[cr][cc];

        if (t === base) { // matched base or wild
          cells.push([cr, cc]);
          baseCount++;
        } 
        else if (t === WILD) {
          wildCells.push([cr, cc]);
        }

        for (const [dr, dc] of dirs) {
          const nr = cr + dr, nc = cc + dc; // look at neighbors
          if (!inBounds(nr, nc)) continue;
          if (tempVisited[nr][nc] || visited[nr][nc]) continue;

          const nt = grid[nr][nc];
          if (nt === base || nt === WILD) {
            tempVisited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }

      const clusterSize = cells.length + wildCells.length; // cluster size
      if (clusterSize >= minSize && baseCount > 0) {
        const fullCluster = [...cells, ...wildCells];
        clusters.push({ type: base, cells: fullCluster });
        for (const [rr, cc] of fullCluster) visited[rr][cc] = true;
      }
    }
  }

  return clusters;
}
