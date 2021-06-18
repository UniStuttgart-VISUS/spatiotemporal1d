import { Dispatch, dispatch } from 'd3-dispatch';
import { Quadtree, quadtree } from 'd3-quadtree';
import { extent, range, sum } from 'd3-array';
import { scaleBand, scaleLinear } from 'd3-scale';
import { interpolatePlasma } from 'd3-scale-chromatic';

import * as T from './types';
import {dataInRadius} from './util';
import BandScale from './band-scale';
import {CurveIdentifier} from './controls';
import {Tooltip} from './tooltip';

type Accessor<U, V> = ((_: U) => V);

const root_hierarchy_node_name: string = '@@ROOT@@';

/**
 * This is the main class that handles the ordering and the main UI.
 *
 * The class is meant to be extended by specialized implementations (see, for
 * example, `corona-vis.ts` or `wildfire-vis.ts`. It has three generic type
 * arguments for specialization. See also `preprocessing/README.md` for a
 * detailed description of the dataset structure.
 *
 *  - `_DSI`: This is `dataset-specific-instructions` that contain at least an
 *            array of the field names contained in the data. This is used for
 *            extracting the relevant time series data in the specific
 *            implementations.
 *  - `_TSD`: This is the `timeseries-datum` type that defines what one
 *            timeseries step's datum looks like. For instance, this is
 *            `number` for the wildfire dataset, and `number[]` for the
 *            COVID-19 dataset.
 *  - `_MD`:  This is the `metadata` type that defines what extra metadata
 *            looks like.
 */
export default class DataManager<
  _DSI extends { fields: string[] },
  _TSD,
  _MD
> {
  // store data on different levels of detail
  private _lods: number;
  private _quadtrees: Quadtree<any>[];

  // order of data along curve
  private _current_strategy: string = 'HilbertProjection';
  _data_order_lut(id: string): number {
    return this._data_order_lut_for(this._current_strategy, id);
  };
  private _data_order_lut_for(curveIdentifier: string, id: string): number {
    return this._reverse_order_luts.get(curveIdentifier).get(id);
  };
  private _reverse_order_luts: Map<string, Map<string, number>>;

  // show fragment at a time
  private _current_lod: number = 0;

  // roles of data
  private _nexus: T.Datum<_TSD> | null = null;
  private _nexus_id: string | null = null;
  private _neighbor_ids: Set<string> = new Set<string>();

  private _parent_name_stack: string[] = [];
  private _dataset: T.DataSet<_DSI, _TSD, _MD>;

  private _data_by_parent_id: Map<string, T.Datum<_TSD>[]> = new Map<string, T.Datum<_TSD>[]>();

  private _name_for_id: Map<string, string> = new Map<string, string>();

  // cutoff radii
  private _neighborhood_radii: number[];
  private _neighborhood_max_count: number = Infinity;

  // OVERVIEW AND DETAIL SCALES
  // overview
  private _overview_scale: BandScale<T.Datum<_TSD>>;

  declare overviewData: (() => T.Datum<_TSD>[]);
  declare overviewPosition: ((d: T.Datum<_TSD>) => T.Extent);
  declare overviewBandwidth: (() => number);
  declare overviewMaxElementWidth: ((n: number) => this);
  declare overviewGap: ((n: number) => this);

  // detail
  private _detail_scale: BandScale<T.Datum<_TSD>>;

  declare detailData: (() => T.Datum<_TSD>[]);
  declare detailPosition: ((d: T.Datum<_TSD>) => T.Extent);
  declare detailBandwidth: (() => number);
  declare detailMaxElementWidth: ((n: number) => this);
  declare detailGap: ((n: number) => this);

  // accessors
  private _id_fn = x => x.id;
  private _distance_fn: ((a: T.Datum<_TSD>, b: T.Datum<_TSD>) => number) = (_, __) => Infinity;

  // events
  private _dispatch: Dispatch<any>;
  private _dispatch_enabled: boolean = false;
  private _queued_dispatches: Map<string, any> = new Map<string, any>();

  // go directly to _dispatch.on
  declare on: (eventtype: string, callback: (...args: any) => void) => void;

  private _curve_tooltip: Tooltip | undefined;

  private _projection_sort_key: string = 'M1';
  private _projection_sort_asc: boolean = false;

  constructor() {
    this._overview_scale = new BandScale<T.Datum<_TSD>>()
      .id(this._id_fn);
    this.overviewPosition = this._overview_scale.positionOf.bind(this._overview_scale);
    this.overviewBandwidth = this._overview_scale.getBandwidth.bind(this._overview_scale);
    this.overviewData = this._overview_scale.getData.bind(this._overview_scale);
    this.overviewMaxElementWidth = d => { this._overview_scale.maxElementWidth(d); return this; };
    this.overviewGap = d => { this._overview_scale.gap(d); return this; };

    this._detail_scale = new BandScale<T.Datum<_TSD>>()
      .id(this._id_fn);
    this.detailPosition = this._detail_scale.positionOf.bind(this._detail_scale);
    this.detailBandwidth = this._detail_scale.getBandwidth.bind(this._detail_scale);
    this.detailData = this._detail_scale.getData.bind(this._detail_scale);
    this.detailMaxElementWidth = d => { this._detail_scale.maxElementWidth(d); return this; };
    this.detailGap = d => { this._detail_scale.gap(d); return this; };

    this._dispatch = dispatch<any>('overviewchange', 'detailchange', 'depthchange', 'link', 'radiuschange', 'reset-brush-rectangle', 'focus-projection');
    this.on = this._dispatch.on.bind(this._dispatch);


    this.on('detailchange.curve-order-tooltip', () => this.onDetailChangeUpdateTooltip());
  }

  suspendEvents(): void {
    this._dispatch_enabled = false;
  }

  resumeEvents(): void {
    this._dispatch_enabled = true;
    const evts = Array.from(this._queued_dispatches);
    this._queued_dispatches.clear();
    evts.forEach(([e, v]) => this._dispatch.call(e, null, v));
  }

  private dispatch(evtname: string, arg?: any): void {
    if (this._dispatch_enabled) this._dispatch.call(evtname, null, arg);
    else this._queued_dispatches.set(evtname, arg);
  }

  reorder(strategy: CurveIdentifier): void {
    this.suspendEvents();

    this.reorderOverview(strategy);

    this.resumeEvents();
  }

  private reorderOverview(strategy: CurveIdentifier): void {
    this._current_strategy = strategy;

    const old_nexus_id = this._nexus_id;

    // set overview data (sorted)
    this._overview_scale.data(this.orderedOverviewData);

    if (old_nexus_id !== null) {
      const focus_elem = this.lodData().filter(d => this._id_fn(d) === old_nexus_id)[0];
      if (focus_elem === undefined) {
        console.error('Refocus error.');
        console.error('Old nexus id:', old_nexus_id);
        console.error('Current LOD:', this._current_lod, 'with data:', this.lodData());
        throw new Error('Unreproducable state!');
      }

      const overview_pos = sum(this.overviewPosition(focus_elem)) / 2;
      this._detail_scale.focus(focus_elem, overview_pos);
    }

    // emit data change
    this.dispatch('overviewchange');
    this.dispatch('detailchange');
    this.dispatch('reset-brush-rectangle');
  }

  async data(d: T.DataSet<_DSI, _TSD, _MD>) {
    this._dataset = d;

    this._quadtrees = [];
    this._lods = 0;
    this._current_lod = 0;
    this._parent_name_stack = [];

    // set strategy
    const url_proj = new URL(window.location.href).searchParams.get('proj');
    const proj_names = d.projections.map(d => d.key);
    if (url_proj !== null && proj_names.includes(url_proj)) this._current_strategy = url_proj;
    else this._current_strategy = proj_names[0];

    // set layouts
    this._reverse_order_luts = new Map<string, Map<string, number>>();
    d.projections.forEach(proj => {
      const lut = new Map<string, number>();
      proj.total_order.forEach((id, idx) => lut.set(id, idx));
      this._reverse_order_luts.set(proj.key, lut);
    });

    // populate parent LUT
    this._data_by_parent_id = new Map<string, T.Datum<_TSD>[]>();
    const add_by_parent = (parent_id: string, data: T.Datum<_TSD>[] | null) => {
      if (data === null) return;

      this._data_by_parent_id.set(parent_id, data);
      data.forEach(d => add_by_parent(d.id, d.children));
      data.forEach(d => this._name_for_id.set(d.id, d.name));
    };
    add_by_parent(root_hierarchy_node_name, d.data);

    // split up data per LOD, add to quadtrees
    let current_data = d.data;
    while (current_data.length) {
      const qt = quadtree<any>()
        .x(d => d.lng)
        .y(d => d.lat)
        .addAll(current_data);
      this._quadtrees.push(qt);
      this._lods += 1;

      const new_data = current_data
        .map(d => {
          const dc = d.children;
          if (dc) return dc;
          return [];
        })
        .reduce((a,b) => a.concat(b), []);
      current_data = new_data;
    }
    // do layout with highest LOD
    this._overview_scale.data(d.data);  // seed
    this._overview_scale.data(this.orderedOverviewData);  // order
    this._detail_scale.data([])
      .focus(null, null);
    this._nexus_id = null;

    if (this._neighborhood_radii?.length !== this._quadtrees.length) {
      this._neighborhood_radii = this._quadtrees.map(_ => 1);
      this.dispatch('depthchange');
    }

    // emit data change
    this.dispatch('overviewchange');
    this.dispatch('detailchange');
  }

  private _last_brushed_element_id: string = undefined;
  brush(d: T.Datum<_TSD> | null): void {
    const id = (d === null) ? null : this._id_fn(d);
    if (this._last_brushed_element_id !== id) {
      this._last_brushed_element_id = id;
      this._dispatch.call('link', null, id);
    }
  }

  focus(d: T.Datum<_TSD> | null): void {
    this._nexus = d;
    if (d === null) {
      this._nexus_id = null;
      this._neighbor_ids.clear();
      this._detail_scale.data([])
        .focus(null, null);
    } else if (!this._radius_changed && this._nexus_id === this._id_fn(d)) {
      return;
    } else {
      const radius = this._neighborhood_radii[this._current_lod];
      this._radius_changed = false;
      const data_around = this.inRadius(this._current_lod, d, radius, this._distance_fn);
      const dist_lut = new Map<string, number>(
        data_around.map(datum => {
          const id = this._id_fn(datum);
          const dist = this._distance_fn(datum, d);
          return [id, dist];
        })
      );

      // cull after maximum amount
      if (data_around.length > this._neighborhood_max_count) {
        data_around.sort((a,b) => dist_lut.get(this._id_fn(a)) - dist_lut.get(this._id_fn(b)));
        data_around.splice(this._neighborhood_max_count);
      }

      const data_before = [];
      const data_after = [];
      const d_idx = this._data_order_lut(this._id_fn(d));
      data_around.forEach(e => {
        const idx = this._data_order_lut(this._id_fn(e));
        if (idx > d_idx) data_after.push(e);
        else if (idx < d_idx) data_before.push(e);
      });

      // sort data_before descending, data_after ascending in distance
      data_before.sort((b,a) => dist_lut.get(this._id_fn(a)) - dist_lut.get(this._id_fn(b)));
      data_after.sort((a,b) => dist_lut.get(this._id_fn(a)) - dist_lut.get(this._id_fn(b)));

      const data = [...data_before, d, ...data_after];

      const overview_pos = sum(this.overviewPosition(d)) / 2;
      this._detail_scale.data(data)
        .focus(d, overview_pos);

      // mark roles of data
      this._nexus_id = this._id_fn(d);
      this._neighbor_ids = new Set<string>([...(data_before.map(this._id_fn)), ...(data_after.map(this._id_fn))]);
    }

    this.dispatch('reset-brush-rectangle');
    this.dispatch('detailchange');
  }

  focusSet(ds: T.Datum<_TSD>[] | null): void {
    if (ds === null) {
      this._detail_scale.data([])
        .focus(null, null);
    } else {
      this._detail_scale.data(ds)
        .focus(null, null);
      this._nexus_id = null;
      this._neighbor_ids = new Set<string>(ds.map(d => this._id_fn(d)));
    }

    this.dispatch('detailchange');
  }

  overviewExtent(ex: T.Extent): this {
    this._overview_scale.extent(ex);
    this.dispatch('overviewchange');

    return this;
  }

  detailExtent(ex: T.Extent): this {
    this._detail_scale.extent(ex);
    this.dispatch('detailchange');

    return this;
  }

  neighborhoodMaxCount(c: number): this {
    this._neighborhood_max_count = c;
    this.focus(null);

    return this;
  }

  private _radius_changed: boolean = true;
  neighborhoodRadius(lod: number, radius?: number): number {
    if (radius !== undefined) {
      this._neighborhood_radii[lod] = radius;

      this.suspendEvents();
      if (lod === this._current_lod) {
        this._radius_changed = true;
        this.focus(this._nexus);
        this.dispatch('radiuschange');
      }
      this.resumeEvents();
    }

    return this._neighborhood_radii[lod];
  }

  notifyRadiusChange(lod: number, radius: number): void {
    this._neighborhood_radii[lod] = radius;
    if (lod === this._current_lod) this.dispatch('radiuschange');
  }

  get depth(): number {
    return this._quadtrees.length;
  }

  get lod(): number {
    return this._current_lod;
  }

  inRadius(lod: number,
    datum: T.Datum<_TSD>,
    radius: number,
    distance_fn: (a: T.Datum<_TSD>, b: T.Datum<_TSD>) => number
  ): T.Datum<_TSD>[] {
    if (lod < 0 || lod >= this._lods || (~~lod) !== lod) return []; // XXX

    return dataInRadius(this._quadtrees[lod], datum, radius, distance_fn);
  }

  // go into subset of data represented by/aggregated in `datum`
  drillDown(datum: T.Datum<_TSD>): void {
    if (this._current_lod === this._lods - 1) return;
    if (!datum.children || datum.children.length === 0) return;

    this.suspendEvents();

    this._nexus = null;
    this._nexus_id = null;
    this._neighbor_ids.clear();

    const parent_id = this._id_fn(datum)
    this._parent_name_stack.push(parent_id);

    this._overview_scale.data(this._data_by_parent_id.get(parent_id));
    this._overview_scale.focus(null, null);
    this.dispatch('overviewchange');

    this._detail_scale.data([]);
    this._detail_scale.focus(null, null);
    this.dispatch('detailchange');

    this.dispatch('radiuschange');

    this.reorderOverview(this._current_strategy);

    this._current_lod++;

    this.resumeEvents();
  }

  // go back one level in drill-down
  revert(): void {
    if (this._current_lod === 0) return;

    this.suspendEvents();

    this._nexus = null;
    this._nexus_id = null;
    this._neighbor_ids.clear();

    // old parent id
    this._parent_name_stack.pop();
    const old_parent_id = this._parent_name_stack.length === 0
      ? root_hierarchy_node_name
      : this._parent_name_stack[this._current_lod - 2];

    this._overview_scale.data(this._data_by_parent_id.get(old_parent_id));
    this._overview_scale.focus(null, null);
    this.dispatch('overviewchange');

    this._detail_scale.data([]);
    this._detail_scale.focus(null, null);
    this.dispatch('detailchange');

    this.dispatch('radiuschange');

    this.reorderOverview(this._current_strategy);

    this._current_lod--;

    this.resumeEvents();
  }

  role(d: T.Datum<_TSD>): string {
    const id = this._id_fn(d);
    if (id === this._nexus_id) return 'nexus';
    if (this._neighbor_ids.has(id)) return 'neighbor';
    return 'regular';
  }

  lodData(): T.Datum<_TSD>[] {
    return this._quadtrees[this._current_lod].data();
  }

  currentNexus(): T.Datum<_TSD> | null {
    return this._nexus;
  }

  currentParentName(): string {
    if (this._parent_name_stack.length === 0) {
      return root_hierarchy_node_name;
    } else {
      return this._parent_name_stack[this._parent_name_stack.length - 1];
    }
  }

  rootData(): T.Datum<_TSD>[] {
    return this._dataset.data as unknown as T.Datum<_TSD>[];
  }

  elementAtOverviewX(x: number): T.Datum<_TSD> | null {
    return this._overview_scale.elementAt(x);
  }

  elementIsSelected(elem: T.Datum<_TSD>): boolean {
    const sel_id = this._id_fn(elem);
    const data = this.detailData();
    for (const datum of data) {
      if (this._id_fn(datum) === sel_id) return true;
    }
    return false;
  }

  elementsInOverviewXSpan([x0, x1]: [number, number]): T.Datum<_TSD>[] {
    // get them the inefficient way...
    const bw2 = this._overview_scale.getBandwidth()/2;
    const elems = [];
    this._overview_scale.getData().forEach(datum => {
      const [xa,xb] = this._overview_scale.positionOf(datum);
      if (xb - bw2 >= x0 && xa + bw2 <= x1) elems.push(datum);
    });

    return elems;
  }

  // focus all elements in a span, return padded span
  focusSetElementsInOverviewXSpan([x0, x1]: [number, number]): [number, number] | null {
    const elems = this.elementsInOverviewXSpan([x0, x1]);

    if (elems.length === 0) {
      this.focusSet(null);
      return null;
    }

    const x0_ = this._overview_scale.positionOf(elems[0])[0];
    const x1_ = this._overview_scale.positionOf(elems[elems.length - 1])[1];

    this.focusSet(elems);
    return [x0_, x1_];
  }

  set distance_fn(fn: (a: T.Datum<_TSD>, b: T.Datum<_TSD>) => number) {
    this._distance_fn = fn;
  }

  private get orderedOverviewData(): T.Datum<_TSD>[] {
    const data = this._overview_scale.getData();
    data.sort((a, b) => this._data_order_lut(this._id_fn(a)) - this._data_order_lut(this._id_fn(b)));
    return data;
  }

  createControlCurveComparison(tooltip: Tooltip, curve: T.Projection) {
    const div = tooltip.root
      .append('div')
      .classed('tooltip__curvecomp', true);

    div.append('div')
      .classed('description', true)
      .html(curve.description);

    if (curve.key === this._current_strategy) {
      tooltip.show();
      return;
    }

    const lut = this._dataset.projections.filter(d => d.key === curve.key)[0].total_order;

    // else: paint a nice picture
    const data = this._overview_scale.getData().map(this._id_fn);

    const current_order = data.map(id => {
      const index = this._data_order_lut(id);
      return {
        i: 0,
        j: 0,
        index,
        id
      };
    });
    current_order.sort((a, b) => a.index - b.index);
    current_order.forEach((d, i) => d.i = i);

    current_order.forEach(d => {
      d.index = lut.indexOf(d.id);
      d.j = 0;
    });
    current_order.sort((a, b) => a.index - b.index);
    current_order.forEach((d, i) => d.j = i);

    const indices = range(current_order.length);
    const max_width = 700;

    const scaleX = scaleBand<number>()
      .domain(indices)
      .range([0, max_width])
      .paddingInner(0.2)
      .paddingOuter(0)
      .align(0)
      .round(true);

    const scaleColor = scaleLinear<number>()
      .domain(extent(indices))
      .range([0, 1]);

    const w = scaleX.bandwidth();
    const end = scaleX(indices[indices.length - 1]) + w;

    const padding = 10;
    const gap = 30;

    const width = end + 2*padding;
    const height = 80 + 2*padding;

    const canvas = div.append<HTMLCanvasElement>('canvas')
      .attr('width', width)
      .attr('height', height)
      .node();

    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);

    // fill all rects
    context.strokeStyle = 'none';
    current_order.forEach((c) => {
      context.fillStyle = interpolatePlasma(scaleColor(c.i));

      const x0 = scaleX(c.i) + padding;
      const x1 = scaleX(c.j) + padding;

      context.fillRect(x0, padding, w, 20);
      context.fillRect(x1, padding + 20 + gap, w, 20);
    });

    // arrow
    const x0 = padding + width/2;
    const y0 = padding + 20 + gap/2;
    context.fillStyle = '#444';
    context.beginPath();
    context.moveTo(x0, y0 + 10);
    context.lineTo(x0 - 10, y0);
    context.lineTo(x0 - 5, y0);
    context.lineTo(x0 - 5, y0 - 10);
    context.lineTo(x0 + 5, y0 - 10);
    context.lineTo(x0 + 5, y0);
    context.lineTo(x0 + 10, y0);
    context.closePath();
    context.fill();

    tooltip.show();
  }

  private _timeline_tooltip_cache: T.Datum<_TSD>[] = [];
  updateTimelineTooltip(elems: T.Datum<_TSD>[]) {
    this._timeline_tooltip_cache = elems;
    console.time('HierarchicalConcept::updateTimelineTooltip');

    const all_elem_ids = this._overview_scale.getData().map(this._id_fn);
    const sort_indices = new Map<CurveIdentifier, string[]>();
    const projs = this._dataset.projections.sort(this.compareProjections.bind(this));

    projs.forEach(({key}) => {
      const lut = this._reverse_order_luts.get(key);
      const indices = all_elem_ids.map(d => d)
        .sort((a, b) => lut.get(a) - lut.get(b));
      sort_indices.set(key, indices);
    });

    // do tooltip
    this._curve_tooltip.root.selectAll('*').remove();

    const indices = range(all_elem_ids.length);
    const max_width = 700;

    const scaleX = scaleBand<number>()
      .domain(indices)
      .range([0, max_width])
      .paddingInner(0)
      .paddingOuter(0)
      .align(0)
      .round(true);

    const scaleColor = scaleLinear<number>()
      .domain(extent(indices))
      .range([0, 1]);

    const w = scaleX.bandwidth();
    const end = scaleX(indices[indices.length - 1]) + w;

    const padding = 10;
    const gap = 10;

    const width = end + 2*padding;
    const height = 2*padding + projs.length * (gap + 10) - gap;

    const xycs = [];
    elems.forEach((elem) => {
      const xyc = projs.map(({key}, i) => {
        return {
          x: scaleX(sort_indices.get(key).indexOf(this._id_fn(elem))),
          y: padding + i * (gap + 10),
          c: (this._nexus_id === this._id_fn(elem))
            ? 'darkblue'
            : (key === this._current_strategy) ? '#c73232': '#999'
        };
      });
      xycs.push(xyc);
    });

    const strategy_labels = projs.map(({key, name}, i) => {
      return {
        name,
        y: padding + i * (gap + 10),
        c: (key === this._current_strategy)
      };
    });

    // DRAWING

    const root = this._curve_tooltip.root
      .append('div')
      .classed('tooltip__grid', true);

    // create labels
    const label_div = root.append<HTMLDivElement>('div')
      .classed('labels', true);
    label_div.selectAll('.label')
      .data(strategy_labels)
      .enter()
      .append('span')
      .classed('label', true)
      .style('top', d => `${d.y - 1}px`)
      .attr('data-state', d => d.c ? 'active' : null)
      .html(d => d.name);

    const canvas = root.append<HTMLCanvasElement>('canvas')
      .attr('width', width)
      .attr('height', height)
      .node();

    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);

    // first, draw lines
    context.beginPath();
    context.strokeStyle = '#aaa';
    context.globalAlpha = 0.5;
    context.lineWidth = 0.5;

    xycs.forEach(xyc => {
      context.moveTo(xyc[0].x + w/2, xyc[0].y + 10);
      xyc.forEach(({x,y}) => {
        context.lineTo(x + w/2, y);
        context.moveTo(x + w/2, y + 10);
      });
    });
    context.stroke();

    context.beginPath();
    context.strokeStyle = '#999';
    context.globalAlpha = 1;
    context.lineWidth = 1;
    context.setLineDash([1,2]);

    // then, horizontal indicator lines
    strategy_labels.forEach(({y}) => {
      context.moveTo(scaleX.range()[0], y+4.5);
      context.lineTo(scaleX.range()[1], y+4.5);
    });
    context.stroke();

    // now, boxes
    context.strokeStyle = 'none';
    context.lineWidth = 0;
    context.globalAlpha = 1

    xycs.forEach(xyc => {
      xyc.forEach(({x,y,c}) => {
        context.fillStyle = c;
        context.fillRect(x, y, w, 10);
      });
    });

    console.timeEnd('HierarchicalConcept::updateTimelineTooltip');
  }


  get current_strategy(): CurveIdentifier {
    return this._current_strategy as CurveIdentifier;
  }

  get projections(): T.Projection[] {
    return this._dataset.projections;
  }

  order_path(strategy: CurveIdentifier): {lat: number, lng: number}[] {
    const data = this._overview_scale.getData()
      .map(d => {
        return {
          id: this._id_fn(d),
          lat: d.lat,
          lng: d.lng
        };
      });
    const lut = this._dataset.projections.filter(d => d.key === strategy)[0].total_order;
    data.sort((a, b) => lut.indexOf(a.id) - lut.indexOf(b.id));

    return data;
  }


  // curve comparison tooltip
  createTooltip() {
    this._curve_tooltip?.clear();

    this._curve_tooltip = new Tooltip();
  }

  clearTooltip() {
    if (this._curve_tooltip) {
      this._curve_tooltip.clear();
      delete this._curve_tooltip;
    }
  }

  showTooltip(show: boolean) {
    if (show) this._curve_tooltip?.show();
    else this._curve_tooltip?.hide();
  }

  moveTooltip(pos: {x: number, y: number}) {
    this._curve_tooltip?.move(pos);
  }

  private onDetailChangeUpdateTooltip() {
    const data = this.detailData();

    if (data.length === 0) this.clearTooltip();
    else {
      if (!this._curve_tooltip) this.createTooltip();
      this.updateTimelineTooltip(data);
      this.showTooltip(true);
    }
  }

  id(d: T.Datum<_TSD>): string {
    return this._id_fn(d);
  }

  indexOfTimestamp(timestamp: Date): number {
    const val = timestamp.valueOf();
    const it = this._dataset.timeseries.series;
    if (it === undefined) return -1;
    let idx = 0;
    for (let elem of it) {
      if (elem.valueOf() === val) return idx;
      ++idx;
    }

    return -1;
  }

  indexOfAttribute(attr: string): number {
    return this._dataset.visualization.fields.indexOf(attr);
  }

  get timeseries(): Date[] {
    return this._dataset.timeseries.series;
  }

  toggleProjectionSortBy(key: string) {
    const asc = (key === this._projection_sort_key && !this._projection_sort_asc || key !== this._projection_sort_key);

    this._projection_sort_key = key;
    this._projection_sort_asc = asc;

    if (this._curve_tooltip) this.updateTimelineTooltip(this._timeline_tooltip_cache);
  }

  compareProjections(a: T.Projection, b: T.Projection): number {
    const lod = this.lod;
    const parent_id = this.currentParentName();
    const sort_by_quality = this._projection_sort_key;
    const order = this._projection_sort_asc ? 1 : -1;

    const sa = a.per_level[lod][parent_id][sort_by_quality];
    const sb = b.per_level[lod][parent_id][sort_by_quality];
    return (sa - sb) * order;
  }

  get projection_sort_key(): string {
    return this._projection_sort_key;
  }

  get projection_sort_asc(): boolean {
    return this._projection_sort_asc;
  }

  get drilldown_path(): string[] {
    const parents = this._parent_name_stack.map(d => this._name_for_id.get(d));
    parents.unshift('World');

    return parents;
  }

  focusProjection(p: string | null) {
    this.dispatch('focus-projection', p);
  }
};
