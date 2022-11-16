import { BrushBehavior, brush, brushSelection } from 'd3-brush';
import { Dispatch, dispatch } from 'd3-dispatch';
import { ScaleTime, scaleSequential, scaleTime } from 'd3-scale';
import { max, range, sum } from 'd3-array';
import { Selection, select } from 'd3-selection';
import { TimeInterval } from 'd3-time';
import { axisLeft } from 'd3-axis';
import { interpolateGreys } from 'd3-scale-chromatic';
import { LatLngExpression } from 'leaflet';

import DataManager from './data-manager';
import Minimap from './minimap';
import * as T from './types';
import {Tooltip} from './tooltip';

export default abstract class Timeline<
  _DSI extends { fields: string[] },
  _TSD,
  _MD
> {
  protected _time_g: Selection<SVGGElement, any, any, any>;
  protected _content_g: Selection<SVGGElement, any, any, any>;
  protected _brush_g: Selection<SVGGElement, any, any, any>;

  protected _time_axis_overview: ScaleTime<number, number>;
  protected _time_axis_detail: ScaleTime<number, number>;

  protected _tree_size: [number, number] = [5, 80];
  protected _dist_size: [number, number] = [95, 105];
  protected _overview_size: [number, number] = [110, 255];
  protected _detail_size: [number, number] = [300, 570];

  protected _old_detail_bandwidth: number;
  protected _old_detail_timespan_str: string = '';
  protected _detail_redraw_flag: boolean = false;


  protected _minimap: Minimap<_TSD>;

  protected _brush: BrushBehavior<any>;

  protected _current_time: Date;

  protected _dispatch: Dispatch<any>;

  declare on: ((typenames: string, callback?: ((this: any, ...args: any[]) => void) | null) => ((this: any, ...args: any[]) => void) | undefined | any);

  constructor(
    protected _svg: Selection<SVGSVGElement, any, any, any>,
    protected _hc: DataManager<_DSI, _TSD, _MD>,
    protected _dateparse: ((ds: string) => (Date | null)),
    protected _dateformat: ((d: Date) => string),
    time_span: [Date, Date],
    protected _time_series: {start: Date, end: Date},
    protected _map_dist_fn: ((a: LatLngExpression, b: LatLngExpression) => number),
    protected _detail_extent: [number, number],
    protected _overview_extent: [number, number],
    protected _time_interval: TimeInterval,
    _total_height: number,
  ) {
    this._detail_size[1] = _total_height - 50;

    this._time_axis_overview = scaleTime<number, number>()
      .domain(time_span)
      .range(this._overview_size);
    this._time_axis_detail = scaleTime<number, number>()
      .domain(time_span)
      .range([0, this._detail_size[1] - this._detail_size[0]]);


    // dispatch
    this._dispatch = dispatch<any>('detail-timespan-change');
    this.on = this._dispatch.on.bind(this._dispatch);

    this.createBrush();
    this.createMinimap();

    this._hc.on('link.timeline', this.onLink.bind(this));
    this._hc.on('reset-brush-rectangle.timeline', this.resetBrush.bind(this));
  }

  private createMinimap(): void {
    const width = this._overview_extent[1] - this._overview_extent[0];
    const height = this._tree_size[1] - this._tree_size[0];

    const canvas = this._svg
      .select<SVGGElement>('.tree')
      .append('foreignObject')
      .attr('x', this._overview_extent[0])
      .attr('width', width)
      .attr('y', this._tree_size[0])
      .attr('height', height)
      .append<HTMLCanvasElement>('xhtml:canvas')
      .attr('width', width)
      .attr('height', height)
      .node();

    const g = this._svg
      .select<SVGGElement>('.tree')
      .append('g')
      .attr('transform', `translate(${this._overview_extent[0]}, ${this._tree_size[0]})`);

    this._minimap = new Minimap<_TSD>(g, canvas, width, height, this._hc);
  }

  protected onLink(id: string|null): void {
    // overview
    this._content_g.selectAll<SVGGElement, T.Datum<_TSD>>('g.overview-element')
      .classed('overview-element--linked', d => d.name === id);
    this._content_g.selectAll<SVGGElement, T.Datum<_TSD>>('g.detail-element')
      .classed('detail-element--linked', d => d.name === id);
  }

  private createBrush() {
    this._brush = brush<any>()
      .extent([[this._overview_extent[0], this._overview_size[0]], [this._overview_extent[1], this._overview_size[1]]])
      .on('start', (event, x) => {
        this._hc.brush(null);
        this._hc.createTooltip();
        if (event.sourceEvent?.type === "mousedown") this._is_dragging_brush = true;
      })
      .on('brush', event => {
        this.updateTooltip(event);
      })
      .on('end', event => {
        this.onBrushSelectionEnd(event);
        this._is_dragging_brush = false;
      });

    this._time_g = this._svg.append('g')
      .classed('time', true);

    this._content_g = this._svg.append('g')
      .classed('overview-detail', true);

    this._brush_g = this._svg.append('g')
      .classed('brush-area', true)
      .call(this._brush);

    this._brush_g.on('wheel', event => {
      event.preventDefault();
      event.stopPropagation();

      if (event.deltaY < 0) this.onBrushScrollUp(event);
      else this.onBrushScrollDown();
    });

    this._brush_g
      .on('mousemove.brush', e => this.onBrushMouseMove(e))
      .on('mousemove.tooltip', e => this.checkShowTooltip(e))
      .on('mouseleave.brush', _ => this._hc.brush(null))
      .on('mouseleave.tooltip', e => this.checkShowTooltip(e));
  }

  // tooltip management stuff
  private _is_dragging_brush: boolean = false;

  private updateTooltip(event) {
    if (event.selection === null) {
      return;
    }

    const evt = event;
    this._hc.showTooltip(true);
    this._hc.moveTooltip({x: evt.clientX, y: evt.clientY});

    const bounds = brushSelection(this._brush_g.node());
    const elems = this._hc.elementsInOverviewXSpan([bounds[0][0], bounds[1][0]]);
    this._hc.updateTimelineTooltip(elems);
  }

  private checkShowTooltip(event: MouseEvent) {
    if (this._is_dragging_brush) return;

    const evt = event;
    const {x,y} = this.relativeEventPosition(evt);
    const bounds = brushSelection(this._brush_g.node());

    this._hc.moveTooltip({x: evt.clientX, y: evt.clientY});

    if (bounds === null) {
      const elemAtX = this._hc.elementAtOverviewX(x);
      const visible = ((elemAtX) ? this._hc.elementIsSelected(elemAtX) : false)
        && y >= this._overview_size[0] && y <= this._overview_size[1];
      this._hc.showTooltip(visible);
    } else if (x >= bounds[0][0] && x <= bounds[1][0] && y >= bounds[0][1] && y <= bounds[1][1]) {
      this._hc.showTooltip(true);
    } else {
      this._hc.showTooltip(false);
    }
  }

  private relativeEventPosition(evt: MouseEvent): {x: number, y: number} {
    const {clientX, clientY} = evt;
    const {top,left} = this._svg.node().getBoundingClientRect();
    const x = clientX - left; // overview_extent is used as range for overview scale anyways
    const y = clientY - top;

    return {x,y};
  }

  private onBrushMouseMove(event: MouseEvent): void {
    const {x} = this.relativeEventPosition(event);
    const elem = this._hc.elementAtOverviewX(x);
    this._hc.brush(elem);
  }

  private onBrushScrollUp(event: MouseEvent): void {
    this.resetBrush();
    const {x} = this.relativeEventPosition(event);

    const elem = this._hc.elementAtOverviewX(x);
    if (elem !== null) this._hc.drillDown(elem);
  }

  private onBrushScrollDown(): void {
    this.resetBrush();
    this._hc.revert();
  }

  private onBrushEmptyClick(event): void {
    // reset detail timeline
    this._time_axis_detail.domain(this._time_axis_overview.domain());
    this._dispatch.call('detail-timespan-change', null, this._time_axis_detail.domain());

    const {x} = this.relativeEventPosition(event.sourceEvent);

    const elem = this._hc.elementAtOverviewX(x);
    this._hc.focus(elem);
  }

  private resetBrush(): void {
    const onend = this._brush.on('end');
    this._brush.on('end', null);

    this._brush.move(<any>this._brush_g, null);
    this._hc.clearTooltip();

    this._brush.on('end', onend);
  }

  private onBrushSelectionEnd(event): void {
    const sel = brushSelection(this._brush_g.node());
    if (sel === null) this.onBrushEmptyClick(event);
    else {
      const onend = this._brush.on('end');
      this._brush.on('end', null);

      const y0_ = sel[0][1];
      const y1_ = sel[1][1];

      const t0 = this._time_interval.round(this._time_axis_overview.invert(y0_));
      const t1 = this._time_interval.round(this._time_axis_overview.invert(y1_));
      this._time_axis_detail.domain([t0, t1]);
      this._dispatch.call('detail-timespan-change', null, this._time_axis_detail.domain());

      const y0 = this._time_axis_overview(t0);
      const y1 = this._time_axis_overview(t1);

      const newpos = this._hc.focusSetElementsInOverviewXSpan([sel[0][0], sel[1][0]]);

      const pos = (newpos === null) ? null : [[newpos[0], y0], [newpos[1], y1]];
      this._brush.move(<any>this._brush_g, <any>pos);

      this._brush.on('end', onend);
    }
  }

  protected abstract drawOverviewDatum(
    context: CanvasRenderingContext2D,
    datum: T.Datum<_TSD>,
    x_range: [number, number]
  ): void;

  onOverviewChange(): void {
    console.time('Timeline::onOverviewChange');
    const ref = this;
    const fmt = this._dateformat;
    const time_axis_overview = this._time_axis_overview;
    const map_dist_fn = this._map_dist_fn;
    const svg = this._content_g;
    const hc = this._hc;

    const dy = time_axis_overview.range()[0];

    const d = this._hc.overviewData();

    this._minimap.structureChanged();

    const sel = svg.selectAll<SVGGElement, any>('g.overview-element')
      .data(d, d => d.name);
    sel.enter()
      .append('g')
      .classed('overview-element', true)
      .merge(sel)
      .attr('transform', d => `translate(${this._hc.overviewPosition(d)[0]}, ${dy})`)
      .each(function(d: T.Datum<_TSD>) {
        const t = select(this);
        t.selectAll('*').remove();

        const x_range = hc.overviewPosition(d);
        const w = x_range[1] - x_range[0];
        const total_h = time_axis_overview.range()[1] - time_axis_overview.range()[0];

        t.append('circle')
          .classed('detail-shown-indicator', true)
          .attr('cx', w/2)
          .attr('cy', -2)
          .attr('r', 2)
          .attr('opacity', 0);

        t.append('rect')
          .classed('background', true)
          .attr('y', 0)
          .attr('width', w)
          .attr('height', total_h)
          .attr('fill', 'white');

        // create canvas
        const canvas = t.append('foreignObject')
          .attr('width', x_range[1] - x_range[0])
          .attr('height', total_h)
          .append<HTMLCanvasElement>('xhtml:canvas')
          .attr('width', x_range[1] - x_range[0])
          .attr('height', total_h)

        const context = canvas.node().getContext('2d');
        ref.drawOverviewDatum(context, d, [0, w]);

        t.on('mouseenter', _ => ref._hc.brush(d))
         .on('mouseleave', _ => ref._hc.brush(null));
      });
    sel.exit().remove();

    svg.selectAll('.overview-time-axis').remove();
    svg.append('g')
      .classed('overview-time-axis', true)
      .attr('transform', `translate(${this._overview_extent[0] - 5}, 0)`)
      .call(axisLeft(time_axis_overview).tickFormat(fmt));

    // show distance between points as 1D heatmap above overview
    const ordered_data = d;
    const inter_point_distances = range(1, ordered_data.length)
      .map(d => [d-1,d])
      .map(function([idx0, idx1]: [number, number]) {
        const d0 = ordered_data[idx0];
        const d1 = ordered_data[idx1];
        const x0 = sum(hc.overviewPosition(d0))/2;
        const x1 = sum(hc.overviewPosition(d1))/2;
        const dist = map_dist_fn(d0, d1);
        const id = `${d0.name}:${d1.name}`;
        const title = `${~~(dist/100)/10}&thinsp;km (${d0.name}&ndash;${d1.name})`;
        return {title,id,dist,x0,x1,d0,d1};
      });
    const value_extent: [number, number] = [ 0, max(inter_point_distances.map(d => d.dist)) ];
    const dist_color_scale = scaleSequential(interpolateGreys)
      .domain(value_extent);

    const dist_sel = this._svg
      .select('g.distances')
      .selectAll<SVGRectElement, {id: string, title:string, dist: number, x0: number, x1: number}>('rect')
      .data(inter_point_distances, d => d.id);
    dist_sel.enter()
      .append('rect')
      .attr('x', ({x0}) => x0)
      .attr('y', this._dist_size[0])
      .attr('width', ({x0,x1}) => x1 - x0)
      .attr('height', this._dist_size[1] - this._dist_size[0])
      .each(function(d) {
        select(this)
          .append('title')
          .html(d.title);
      })
      .merge(dist_sel)
      .each(function(d) {
        select(this)
          .select('title')
          .html(d.title);
      })
      .transition()
      .attr('x', ({x0}) => x0)
      .attr('y', this._dist_size[0])
      .attr('width', ({x0,x1}) => x1 - x0)
      .attr('height', this._dist_size[1] - this._dist_size[0])
      .attr('fill', ({dist}) => dist_color_scale(dist));
    dist_sel.exit().remove();

    console.timeEnd('Timeline::onOverviewChange');
  }

  protected abstract prepareDetailDrawing(
    data: T.Datum<_TSD>[],
    extent_x: [number, number],
    extent_y: [number, number]
  ): any;

  protected abstract drawDetailDatum(
    g: Selection<SVGGElement, any, any, any>,
    context: CanvasRenderingContext2D,
    prepared: any,
    scale_y: ScaleTime<number, number>,
    datum: T.Datum<_TSD>
  ): void;

  onDetailChange(): void {
    console.time('Timeline::onDetailChange');
    const ref = this;
    const time_axis_overview = this._time_axis_overview;
    const svg = this._content_g;
    const hc = this._hc;

    // use d3 create-update-remove cycle to increase performance. it is not like the details change
    const d = hc.detailData();
    this._minimap.brushingChanged();

    const __extent_x = (d.length > 0) ? hc.detailPosition(d[0]) : [0,0];
    const extent_x: [number, number] = [0, __extent_x[1] - __extent_x[0]];
    const extent_y = this._detail_size;

    const prepared = this.prepareDetailDrawing(d, extent_x, extent_y);

    const scale_y = this._time_axis_detail;
    const axis_y = axisLeft(scale_y)
      .tickFormat(this._dateformat);

    // create y axis
    const y_axis_sel = svg.selectAll<SVGGElement, null>('.detail-axis-y')
      .data([null]);
    y_axis_sel.enter()
      .append('g')
      .classed('detail-axis-y', true)
      .merge(y_axis_sel)
      .attr('transform', `translate(${this._detail_extent[0] - 5}, ${extent_y[0]})`)
      .call(axis_y);
    y_axis_sel.exit().remove();

    // if bandwidth changed, remove all
    const bandwidth = hc.detailBandwidth();
    const detail_timespan = JSON.stringify(this._time_axis_detail.domain());
    if (bandwidth !== this._old_detail_bandwidth
      || detail_timespan !== this._old_detail_timespan_str
      || this._detail_redraw_flag
    ) {
      this._old_detail_bandwidth = bandwidth;
      this._old_detail_timespan_str = detail_timespan;
      this._detail_redraw_flag = false;

      svg.selectAll('g.detail-element').remove();

      // refresh current time marker
      this.setTimePost();
    }

    // create or update detail axes
    const detail_sel = svg.selectAll<SVGGElement, T.HierarchizedAggregatedData<T.SpanData>>('g.detail-element')
      .data(d, d => d.name);
    // ENTER
    detail_sel.enter()
      .append('g')
      .classed('detail-element', true)
      .classed('detail-element--selected', d => hc.role(d) === 'nexus')
      .each(function(d) {
        const s = select(this);

        // background
        s.append('rect')
          .classed('background', true)
          .attr('x', -2)
          .attr('y', 0)
          .attr('width', extent_x[1] + 4)
          .attr('height', extent_y[1] - extent_y[0])
          .attr('fill', 'white');

        // title and text above detail
        s.append('title').text(d.name);

        const id = `text-path-${btoa(encodeURIComponent(d.name))}`;
        s.append('path')
          .attr('id', id)
          .attr('d', `M 5 -2 L ${extent_x[1] - 5} -2`);
        s.append('text')
          .classed('detail-text', true)
          .attr('font-size', 8)
        //.attr('x', 5)
        //.attr('y', -2)
          .append('textPath')
          .attr('xlink:href', `${location.href}#${id}`)
          .text(d.name);

        // draw actual data
        const canvas = s.append('foreignObject')
          .attr('width', extent_x[1] - extent_x[0])
          .attr('height', extent_y[1] - extent_y[0])
          .append<HTMLCanvasElement>('xhtml:canvas')
          .attr('width', extent_x[1] - extent_x[0])
          .attr('height', extent_y[1] - extent_y[0]);

        const context = canvas.node().getContext('2d');
        ref.drawDetailDatum(s, context, prepared, scale_y, d);

        // connector between overview and detail
        s.append('path')
          .classed('connector', true);

        s.on('mouseenter', _ => ref._hc.brush(d))
         .on('mouseleave', _ => ref._hc.brush(null));
      })
    // ENTER+UPDATE
      .merge(detail_sel)
        .attr('transform', d => `translate(${hc.detailPosition(d)[0]}, ${extent_y[0]})`)
        .each(function(d) {
          const dx = -hc.detailPosition(d)[0];

          // update connector path
          const [a, b] = extent_x;
          const y1 = extent_y[0];
          const pos2 = hc.overviewPosition(d).map(d => d + dx);
          const y0 = time_axis_overview.range()[1];
          const y0a = y0 + 8; // trapez starts a bit below, rectangular area above that
          select<SVGGElement, T.Datum<_TSD>>(this)
            .select<SVGPathElement>('path.connector')
            .attr('transform', `translate(0, ${-extent_y[0]})`)
            .attr('fill', hc.role(d) === 'nexus' ? '#a44' : '#444')
            .attr('opacity', 0.2)
            .attr('d', `M${a} ${y1} L${b} ${y1} ${pos2[1]} ${y0a} ${pos2[1]} ${y0} ${pos2[0]} ${y0} ${pos2[0]} ${y0a} Z`);

          select(this)
            .select('rect.background')
            .attr('stroke', (d: T.Datum<_TSD>) => hc.role(d) === 'nexus' ? 'red' : 'white');
        });
    // EXIT
    detail_sel.exit().remove();

    // overview markers
    const s = new Set<string>(d.map(e => e.name));
    svg.selectAll<SVGGElement, T.Datum<_TSD>>('g.overview-element')
      .classed('overview-element--selected', d => s.has(d.name))
      .each(function(d) {
        select(this)
          .select('.detail-shown-indicator')
          .attr('opacity', s.has(d.name) ? 1 : 0)
          .attr('fill', hc.role(d) === 'nexus' ? '#a44' : '#000');
      });

    // overview time axis indicator
    {
      const ys: [number, number] = <[number, number]>(this._time_axis_detail.domain().map(this._time_axis_overview));
      const sel = this._content_g
        .selectAll<SVGRectElement, [number, number]>('rect.detail-zoom-marker')
        .data([ys]);
      sel.enter()
        .append('rect')
        .classed('detail-zoom-marker', true)
        .attr('fill', '#44a')
        .attr('opacity', 0.8)
        .merge(sel)
        .attr('x', this._overview_extent[0] - 9)
        .attr('width', 2)
        .attr('y', ([y0, _]) => y0)
        .attr('height', ([y0, y1]) => y1-y0);
      sel.exit().remove();
    }

    console.timeEnd('Timeline::onDetailChange');
  }

  setTime(t: Date): void {
    this._current_time = t;
    this.setTimePost();
  }

  abstract setTimePost(): void;
};
