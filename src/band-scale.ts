import {scaleBand, ScaleBand} from 'd3-scale';

import {Extent} from './types';

export default class BandScale<_Tp> {
  // focus point (may be null)
  private _focus: _Tp | null = null;
  // focus center (may be null)
  private _focus_center: number | null = null;

  private _id_fn: (d: _Tp) => string = JSON.stringify;

  // extent
  private _extent: Extent = [0, 1];
  private _scale: ScaleBand<string>;

  // maximum width per item
  private _max_width: number = Infinity;

  // gap? px?
  private _gap: number = 0;

  // data itself
  private _data: _Tp[];
  private _data_lut: Map<string, _Tp>;

  private _up_to_date: boolean = false;

  constructor() {
    this._scale = scaleBand<string>()
      .domain([])
      .range(this._extent);
  }

  private recalc(): void {
    // do stuff
    const elem_length = this._data.length * (this._max_width + this._gap);
    const extent_length = this._extent[1] - this._extent[0];

    if (extent_length <= elem_length) {
      // fill space, not enough space to align details
      this._scale.domain(this._data.map(this._id_fn))
        .range(this._extent);
    } else {
      // try to place focus at focus_center, else center in available space
      if (this._focus !== null) {
        // first, get relative position of focus element
        this._scale.domain(this._data.map(this._id_fn))
          .range([this._extent[0], this._extent[0] + elem_length]);
        const focus_pos = this._scale(this._id_fn(this._focus)) + this._max_width / 2;
        const want_to_move = this._focus_center - focus_pos;
        if (want_to_move > 0) {
          const can_move = extent_length - elem_length;
          const delta = Math.min(can_move, want_to_move);
          this._scale.range([delta + this._extent[0], delta + this._extent[0] + elem_length]);
        }
      } else {
        const center = (this._extent[0] + this._extent[1])/2;
        this._scale.domain(this._data.map(this._id_fn))
          .range([center - elem_length/2, center + elem_length/2]);
      }
    }

    this._scale.round(true);
    this._up_to_date = true;
  }

  // get position of datum
  positionOf(datum: _Tp): Extent {
    if (!this._up_to_date) this.recalc();

    const x0 = this._scale(this._id_fn(datum));
    const x1 = this._scale.bandwidth() - this._gap;

    return [x0, x0+x1];
  }

  // get datum at position
  elementAt(coord: number): _Tp | null {
    const strs = this._scale.domain();
    // TODO inefficient
    for (const str of strs) {
      const a = this._scale(str);
      const b = a + this._scale.bandwidth();
      if (a <= coord && b >= coord) return this._data_lut.get(str);
    }
    return null;
  }

  // set focus point and center
  focus(datum: _Tp | null, center: number | null): this {
    this._focus = datum;
    this._focus_center = center;

    this._up_to_date = false;

    return this;
  }

  extent(ex: Extent): this {
    this._extent = ex;

    this._up_to_date = false;

    return this;
  }

  maxElementWidth(w: number): this {
    this._max_width = w;

    this._up_to_date = false;

    return this;
  }

  gap(g: number): this {
    this._gap = g;

    this._up_to_date = false;

    return this;
  }

  data(d: _Tp[]): this {
    this._data = d;
    this._data_lut = new Map<string, _Tp>(d.map(e => [this._id_fn(e), e]));

    this._up_to_date = false;

    return this;
  }

  id(fn: ((_Tp) => string)): this {
    this._id_fn = fn;

    this._up_to_date = false;

    return this;
  }

  getData(): _Tp[] {
    return this._data;
  }

  getBandwidth(): number {
    if (!this._up_to_date) this.recalc();
    return this._scale.bandwidth() - this._gap;
  }
};
