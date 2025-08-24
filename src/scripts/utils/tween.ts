// tween.ts

import { Ticker } from 'pixi.js';

export type Easing = (t:number)=>number;
export const easeOutCubic: Easing = (t)=>1-Math.pow(1-t,3);
export const easeInCubic: Easing = (t)=>t*t*t;
export const linear: Easing = (t)=>t;

/** Small helper so we stop doing setTimeout everywhere */
export const delay = (ms:number) => new Promise<void>(res => setTimeout(res, ms));

/* ------------------------------------------------------------------ */
/* 1) Promise-style tween for ad-hoc animations (SymbolView, etc.)    */
/* ------------------------------------------------------------------ */
export function tween(
  update:(t:number)=>void,
  durationMs:number,
  easing:Easing = easeOutCubic,
): Promise<void> {
  return new Promise(res=>{
    let elapsed = 0;
    const tick = (dt:number) => {
      elapsed += dt * (1000/60); // convert delta frames to ms
      const t = Math.min(elapsed / durationMs, 1);
      update(easing(t));
      if (t === 1) {
        Ticker.shared.remove(tick);
        res();
      }
    };
    Ticker.shared.add(tick);
  });
}

/* ------------------------------------------------------------------ */
/* 2) Property tween manager used by reels                            */
/* ------------------------------------------------------------------ */
type Tween = {
  object:any;
  property:string;
  propertyBeginValue:number;
  target:number;
  easing:Easing;
  time:number;
  start:number;
  change?: (t:Tween)=>void;
  complete?: (t:Tween)=>void;
};

const tweening: Tween[] = [];

export function tweenTo(
  object:any,
  property:string,
  target:number,
  time:number,
  easing:Easing,
  change?: (t:Tween)=>void,
  complete?: (t:Tween)=>void
) {
  const tween: Tween = {
    object, property,
    propertyBeginValue: object[property],
    target, easing, time,
    change, complete,
    start: Date.now()
  };
  tweening.push(tween);
  return tween;
}

export function updateTweens() {
  const now = Date.now();
  const remove: Tween[] = [];
  for (const t of tweening) {
    const phase = Math.min(1, (now - t.start) / t.time);
    t.object[t.property] = lerp(t.propertyBeginValue, t.target, t.easing(phase));
    if (t.change) t.change(t);
    if (phase === 1) {
      t.object[t.property] = t.target;
      if (t.complete) t.complete(t);
      remove.push(t);
    }
  }
  for (const r of remove) {
    tweening.splice(tweening.indexOf(r), 1);
  }
}

function lerp(a1:number, a2:number, t:number) {
  return a1 * (1 - t) + a2 * t;
}

export function backout(amount:number) {
  return (t:number) => --t * t * ((amount + 1) * t + amount) + 1;
}
