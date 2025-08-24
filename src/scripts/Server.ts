// Server.ts
import { COLS, ROWS, SYMBOL_TYPES, WILD } from './constants';
import { findClusters } from './clusterUtils';

export type SpinResponse = { matrix: string[][], combine?: string[] };

export default class Server {
  private listeners: ((data:SpinResponse)=>void)[] = [];

  onData(cb:(data:SpinResponse)=>void){ this.listeners.push(cb); }

  /** random weighted type (less K) */
  private randType(): string {
    if (Math.random() < 0.1) return WILD; // 10% chance

    // pick from non-wild types equally
    const nonWilds = SYMBOL_TYPES.filter(s => s !== WILD);
    return nonWilds[(Math.random() * nonWilds.length) | 0];
  }


  private randomMatrix(): string[][] {
    const m: string[][] = Array.from({length:ROWS},()=>
        Array(COLS).fill(''));
    for (let r=0;r<ROWS;r++){
      for (let c=0;c<COLS;c++){
        m[r][c] = this.randType();
      }
    }
    return m;
  }

  
  /** Simulates the spec: min 2s spin on FE, server may be late. */
  requestSpinData(): void {
    const delay =
      100 + Math.random() * 1500 + (Math.random() > 0.8 ? 2000 : 0);
    setTimeout(() => {
      const matrix = this.randomMatrix();
      const clusters = findClusters(matrix);
      const combine = clusters.map(
        (c) =>
          `${c.type};${c.cells
            .map(([rr, cc]) => rr * COLS + cc)
            .join(',')};${(c.cells.length * 0.5).toFixed(2)}`
      );
      const payload: SpinResponse = {
        matrix,
        combine: combine.length ? combine : undefined,
      };
      this.listeners.forEach((cb) => cb(payload));
    }, delay);
  }

  /** When FE has gaps, it asks for top-fill for each column (how many per column). Return array[col] = newTypesTopDown */
  requestRefill(countPerCol:number[]): Promise<string[][]> {
    return new Promise(res=>{
      setTimeout(()=>{
        const cols: string[][] = [];
        for (let c=0;c<COLS;c++){
          const n = countPerCol[c]||0;
          cols[c] = [];
          for (let i=0;i<n;i++) cols[c].push(this.randType());
        }
        res(cols);
      }, 120 + Math.random()*200);
    });
  }
}
