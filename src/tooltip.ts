import {Selection, select} from 'd3-selection';

export interface Point {
  x: number;
  y: number;
};

export class Tooltip {
  private _root: Selection<HTMLDivElement, any, any, any>;
  private padding: number = 25;

  private _oldpos: Point = {x: -1000, y: -1000};
  private readonly _threshold = Math.pow(5, 2); // 5px

  constructor() {
    this._root = select<HTMLBodyElement, any>('body')
      .append('div')
      .classed('tooltip', true)
      .attr('data-state', 'hidden');
  }

  get root(): Selection<HTMLDivElement, any, any, any> {
    return this._root;
  }

  move(p: Point) {
    // hysteresis
    const dist_sq = Math.pow(p.x - this._oldpos.x, 2) + Math.pow(p.y - this._oldpos.y, 2);
    if (dist_sq < this._threshold) return;
    this._oldpos = p;

    const w = document.documentElement.clientWidth;
    const h = document.documentElement.clientHeight;

    const pos: any = {};

    if (p.x > w/2) {
      // to left of cursor
      pos.right = w - p.x + this.padding;
      pos.left = null;
    } else {
      // to right of cursor
      pos.right = null;
      pos.left = p.x + this.padding;
    }

    if (p.y > h/2) {
      // over cursor
      pos.bottom = h - p.y + this.padding;
      pos.top = null;
    } else {
      // to right of cursor
      pos.top = p.y + this.padding;
      pos.bottom = null;
    }

    for (let k in pos) {
      const v = (pos[k] !== null) ? `${pos[k]}px` : null;
      this._root.style(k, v);
    }
  }

  clear() {
    this._root.remove();
  }

  show() {
    this._root.attr('data-state', null);
  }

  hide() {
    this._root.attr('data-state', 'hidden');
  }
};
