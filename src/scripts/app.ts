// app.ts

import { Application, Ticker } from 'pixi.js';
import { APP_HEIGHT, APP_WIDTH } from './constants';
import { GameScene } from './GameScene';
import Server from './Server';
import { updateTweens } from './utils/tween';

export class MainApp {
  static inst: MainApp;
  public app!: Application;

  public constructor () {
    MainApp.inst = this;
  }

  async boot() {
    this.app = new Application({
      backgroundColor: 0xefe1de,
      width: APP_WIDTH,
      height: APP_HEIGHT,
      antialias: true,
      // resizeTo: window, 
    });

    document.body.appendChild(this.app.view as HTMLCanvasElement);

    // add tween updates to the global ticker - for reel tweenTo
    Ticker.shared.add(() => {
      updateTweens();
    });

    const scene = new GameScene(this.app, new Server());
    await scene.init();
    this.app.stage.addChild(scene);
  }
}

window.onload = async () => {
  await new MainApp().boot();
};
