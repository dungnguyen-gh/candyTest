// GameScene.ts

import { Application, Assets, Container, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { APP_HEIGHT, APP_WIDTH, BOARD_TOP, COLS, MIN_SPIN_MS, REEL_STAGGER_MS, ROWS, SYMBOL_TYPES } from './constants';
import Server from './Server';
import { Board } from './Board';

export class GameScene extends Container {
  private server: Server;
  private board!: Board;
  private spinBtn!: Text;
  private logo!: Sprite;
  private textures: Record<string, Texture> = {};
  private spinning = false;
  private app: Application;

  constructor(app: Application, server: Server){
    super();
    this.app = app;
    this.server = server;
    this.server.onData(this.onServerSpin.bind(this));
  }

  async init() {
    // load assets
    await Assets.load([
      'images/logo.png',
      ...SYMBOL_TYPES.map(s => `images/symbol_${s}.png`),
    ]);
    this.logo = Sprite.from('images/logo.png');
    this.logo.anchor.set(0.5);
    this.logo.x = APP_WIDTH/2;
    this.logo.y = 100;
    this.logo.scale.set(0.5);
    this.addChild(this.logo);

    SYMBOL_TYPES.forEach(s=>{
      this.textures[s] = Texture.from(`images/symbol_${s}.png`);
    });

    // first board content: just random for display before first spin
    const firstMatrix: string[][] = [];
    for (let r=0;r<ROWS;r++){
      firstMatrix[r] = [];
      for (let c=0;c<COLS;c++){
        firstMatrix[r][c] = SYMBOL_TYPES[(Math.random()*SYMBOL_TYPES.length)|0];
      }
    }
    this.board = new Board(this.textures, firstMatrix);
    this.board.x = (APP_WIDTH - COLS * 110)/2; // center-ish horizontally
    this.addChild(this.board);

    // spin btn
    const style = new TextStyle({
    fontFamily: 'Arial',
    fontSize: 36,
    fontWeight: 'bold',
    fill: 0xffffff,    
    stroke: 0x4a1850,     
    strokeThickness: 5  
});
    this.spinBtn = new Text('Start Spin', style);
    this.spinBtn.x = APP_WIDTH/2 - this.spinBtn.width/2;
    this.spinBtn.y = APP_HEIGHT - 200;
    this.addChild(this.spinBtn);
    this.spinBtn.eventMode = 'static';
    this.spinBtn.cursor = 'pointer';
    this.spinBtn.on('pointerdown', ()=> this.startSpin());

    // small rotation for logo
    this.app.ticker.add(()=>{ this.logo.rotation += 0.01; });
  }

  private lockUI(lock:boolean){
    this.spinning = lock;
    this.spinBtn.alpha = lock? 0.5: 1.0;
    this.spinBtn.eventMode = lock? 'none' : 'static';
  }

  private async startSpin(){
    if (this.spinning) return;
    this.lockUI(true);

    const spinStart = Date.now();
    this.server.requestSpinData(); // async server (may be late)
    await this.board.spinStart();  // visually start reels left→right

    // wait minimum spin
    const waitMin = async()=> new Promise(r=>{
      const left = Math.max(0, MIN_SPIN_MS - (Date.now() - spinStart));
      setTimeout(r, left);
    });
    await waitMin();
    // actual stop happens in onServerSpin when data arrives
  }

  private async onServerSpin(data: {matrix:string[][], combine?:string[]}) {
    // ensure reels stop with this matrix, in left to right order
    await this.board.spinStop(data.matrix);

    // after stopping, wait 
    await new Promise(r => setTimeout(r, 1000));
    
    // chain explosions & refills until stable
    await this.chainExplodeRefill();

    // finally unlock UI
    this.lockUI(false);
  }

  private async chainExplodeRefill(){
    while (true) {
      const clusters = this.board.findClusters(4);
      if (!clusters.length) break;

      // explode clusters
      await this.board.explode(clusters);

      // add pause before refill
      await new Promise((resolve) => setTimeout(resolve, 500));

      // ask server to refill per column
      // count missing per column after explode(symbols with visible=false)
      //const grid = this.board.snapshotTypes();
      const missingPerCol: number[] = new Array(COLS).fill(0);
      for (let c=0;c<COLS;c++){
        let missing = 0;
        for (let r=0;r<ROWS;r++){
          if (!this.board.reels[c].getSymbolAt(r)?.visible) missing++;
        }
        missingPerCol[c] = missing;
      }

      // ask server for refill symbols
      const refillCols = await this.server.requestRefill(missingPerCol);
      // drop new ones in
      await this.board.dropAndRefill(refillCols);
      // loop and check again until no more clusters (cascade)
    }
  }
}
