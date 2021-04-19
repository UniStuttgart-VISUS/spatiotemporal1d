import { ScaleThreshold, ScaleTime, scaleLinear, scaleThreshold, scaleTime } from 'd3-scale';
import { Selection, event, select, } from 'd3-selection';
import { axisBottom, axisTop } from 'd3-axis';
import { drag } from 'd3-drag';
import { format } from 'd3-format';
import { timeFormat, timeParse } from 'd3-time-format';
import { timeDay } from 'd3-time';
import { hsl } from 'd3-color';
import { range, sum } from 'd3-array';
import { json } from 'd3-fetch';
import { interpolateYlOrBr } from 'd3-scale-chromatic';
import { CircleMarker, LatLngExpression, LatLngLiteral, LeafletMouseEvent, circleMarker, map, Map as LeafletMap, polygon, Polygon } from 'leaflet';

import * as T from './types';
import DataManager from './data-manager';
import {Controls} from './controls';
import MapPane from './map-pane';
import Timeline from './timeline';
import {SingleTimestepControl,createControls} from './time-control';

const dateparse = timeParse('%Y-%m-%d');

type WildfireExtraInformation = {
  fields: string[];
};
type WildfireTimelineDatum = number;
type WildfireMetadata = {};
export type Data = T.DataSet<WildfireExtraInformation, WildfireTimelineDatum, WildfireMetadata>;

export default class Visualization {
  private _concept: DataManager<WildfireExtraInformation, WildfireTimelineDatum, WildfireMetadata>;
  private _timeline: WildfireTimeline;
  private _map: WildfireMapPane;
  private _controls: Controls;

  constructor(url: string) {
    this.loadData(url);
  }

  private async loadData(url: string) {
    const _json: T.DataSetRaw<WildfireExtraInformation, WildfireTimelineDatum, WildfireMetadata> = await json(url);
    const parsed = await(this.parseData(_json));
    await this.init(parsed);

    this._concept.resumeEvents();
    this._timeline.setTime(parsed.timeseries.end);
  }

  private async parseData({data, timeseries,visualization,metadata,projections}: T.DataSetRaw<WildfireExtraInformation, WildfireTimelineDatum, WildfireMetadata>): Promise<Data> {
    const dateparse2 = timeParse(timeseries.format);
    const ts = {
      format: timeseries.format,
      start: dateparse2(timeseries.start),
      end: dateparse2(timeseries.end),
      series: timeseries.series?.map(dateparse2)
    };

    return {
      timeseries: ts,
      visualization,
      metadata,
      data,
      projections
    };
  }

  private async init(data: Data) {
    const lmap = map('map-div', {
      maxBounds: [[90, -240], [-90, 240]],
      zoomSnap: 0.1
    }).setView([-33, 150], 5);

    const parse = timeParse(data.timeseries.format);
    const fmt = timeFormat('%Y-%m-%d');
    const time_span: [Date, Date] = [data.timeseries.start, timeDay.offset(data.timeseries.end, 0)];

    const day = timeFormat(data.timeseries.format)(data.timeseries.end);

    const __steps = range(1, 12);
    const thresholds = __steps.map(d => Math.pow(3, d));
    const radii = [0].concat(__steps.map(d => d*1.2+0.5));
    const colors_offset = scaleLinear()
      .domain([__steps[0], __steps[__steps.length - 1]])
      .range([0.2, 1]);
    const cols = ['#fff']
      .concat(__steps.map(x => interpolateYlOrBr(colors_offset(x))));
    const colors = scaleThreshold<number, string>()
      .domain(thresholds)
      .range(cols);
    const sizes = scaleThreshold()
      .domain(thresholds)
      .range(radii);

    const colors_muted = scaleThreshold<number, string>()
      .domain(colors.domain())
      .range(colors.range().map(col => {
        const c = hsl(col);
        c.s = c.s * 0.2; // CSS: greyscale(80%)
        return c.toString();
      }));

    const svg = select<SVGSVGElement, any>('svg#timeline');

    const {width, height} = svg.node().getBoundingClientRect();
    const hc = new DataManager<WildfireExtraInformation, WildfireTimelineDatum, WildfireMetadata>();
    const ext: [number, number] = [90, width - 50];
    hc.overviewExtent(ext)
      .detailExtent(ext)
      .overviewMaxElementWidth(10)
      .detailMaxElementWidth(20)
      .overviewGap(0)
      .detailGap(10)
      .neighborhoodMaxCount(80);
    await hc.data(data);


    // create timeline
    this._timeline = new WildfireTimeline(
      svg, hc, dateparse, fmt,
      time_span,
      colors, colors_muted,
      data.timeseries,
      lmap.distance.bind(lmap),
      ext, ext,
      height
    );
    hc.on('overviewchange.timeline', () => this._timeline.onOverviewChange());
    hc.on('detailchange.timeline', () => this._timeline.onDetailChange());

    // create map
    this._map = new WildfireMapPane(hc, lmap, colors, colors_muted, sizes, data.timeseries, day, fmt, parse, this._timeline);
    hc.on('overviewchange.map', () => this._map.onOverviewChange());
    hc.on('detailchange.map', () => this._map.onDetailChange());

    this._concept = hc;
    hc.distance_fn = ((a, b) => lmap.distance(a, b) / 1000);

    hc.on('link.map', d => this._map.onLink(d));
    hc.on('focus-projection.map', d => this._map.onProjectionFocus(d));

    // create controls
    this._controls = new Controls(select<HTMLDivElement, any>('.controls'), hc);

    // sensible cutoff radii
    [400, 100, 50].forEach((radius, index) => hc.neighborhoodRadius(index, radius));
    this._controls.onDepthChange();
    hc.on('depthchange.controls', this._controls.onDepthChange.bind(this._controls));
    hc.on('overviewchange.controls', this._controls.onOverviewChange.bind(this._controls));
  }
};

class WildfireTimeline extends Timeline<WildfireExtraInformation, WildfireTimelineDatum, WildfireMetadata> {
  constructor(
    svg: Selection<SVGSVGElement, any, any, any>,
    hc: DataManager<WildfireExtraInformation, WildfireTimelineDatum, WildfireMetadata>,
    dateparse: ((ds: string) => (Date | null)),
    dateformat: ((d: Date) => string),
    time_span: [Date, Date],
    private _color_scale: ScaleThreshold<number, string>,
    private _color_scale_muted: ScaleThreshold<number, string>,
    time_series: {start: Date, end: Date},
    map_dist_fn: ((a: LatLngExpression, b: LatLngExpression) => number),
    detail_extent: [number, number],
    overview_extent: [number, number],
    total_height: number,
  ) {
    super(svg, hc, dateparse, dateformat, time_span, time_series, map_dist_fn, detail_extent, overview_extent, timeDay, total_height);

    // minimap: get color
    this._minimap.fillColorCallback = (
      datum: T.Datum<WildfireTimelineDatum>,
      time: Date,
      brushed: boolean
    ) => {
      const d = datum.data[this._hc.indexOfTimestamp(time)];
      if (brushed) {
        return this._color_scale(d);
      } else {
        return this._color_scale_muted(d);
      }
    };
  }

  protected drawOverviewDatum(
    context: CanvasRenderingContext2D,
    datum: T.Datum<WildfireTimelineDatum>,
    x_range: [number, number]
  ): void {
    const x = x_range[0];
    const w = x_range[1] - x;

    this._hc.timeseries.forEach((day, i) => {
      const count = datum.data[i];
      context.fillStyle = (count !== undefined) ? this._color_scale(count) : 'lightgrey';
      const y0 = this._time_axis_overview.range()[0];
      const y1 = this._time_axis_overview(day);
      const y2 = this._time_axis_overview(timeDay.offset(day));
      context.fillRect(x, y1-y0, w, y2-y1);
    });
  }

  protected prepareDetailDrawing(
    data: T.Datum<WildfireTimelineDatum>[],
    extent_x: [number, number],
    extent_y: [number, number]
  ): any {
    const x_range = [0, extent_x[1] - extent_x[0]];

    const [min, max] = this._time_axis_detail.domain();
    const idx0 = this._hc.indexOfTimestamp(min);
    const idx1 = this._hc.indexOfTimestamp(timeDay.offset(max, -1));
    const idx_range = range(idx0, idx1+1);

    return {x_range, idx_range};
  }

  protected drawDetailDatum(
    _: Selection<SVGGElement, any, any, any>,
    context: CanvasRenderingContext2D,
    prepared: {x_range: [number, number], idx_range: number[]},
    scale_y: ScaleTime<number, number>,
    datum: T.Datum<WildfireTimelineDatum>,
  ): void {
    prepared.idx_range.forEach(i => {
      const date = this._hc.timeseries[i];
      const count = datum.data[i];
      context.fillStyle = this._color_scale(count);
      const y0 = scale_y(date);
      const y1 = scale_y(timeDay.offset(date));
      context.fillRect(prepared.x_range[0], y0, prepared.x_range[1] - prepared.x_range[0], y1 - y0);
    });
  }

  setTimePost(): void {
    const t = this._current_time;

    this._minimap.timeChanged(t);
    const overview_y0 = this._time_axis_overview(t);
    const overview_y1 = this._time_axis_overview(timeDay.offset(t));

    const sel = this._time_g
      .selectAll<SVGRectElement, any>('rect.time-line-overview')
      .data([null]);
    sel.enter()
      .append('rect')
      .classed('time-line-overview', true)
      .attr('stroke', '#444')
      .attr('stroke-opacity', 0.7)
      .attr('stroke-width', 1)
      .attr('fill', 'none')
      .merge(sel)
      .attr('x', this._overview_extent[0] - 5)
      .attr('width', this._overview_extent[1] - this._overview_extent[0] + 5)
      .attr('y', overview_y0)
      .attr('height', overview_y1 - overview_y0);
    sel.exit().remove();

    const detail_scale = this._time_axis_detail;
    const detail_y0 = detail_scale(t);
    const detail_y1 = detail_scale(timeDay.offset(t));

    // remove existing rect with d3 enter-update-exit if outside viable range
    const detail_data = (detail_y0 > detail_scale.range()[1] || detail_y1 < detail_scale.range()[0])
      ? []
      : [null];

    const sel2 = this._time_g
      .selectAll<SVGRectElement, any>('rect.time-line-detail')
      .data(detail_data);
    sel2.enter()
      .append('rect')
      .classed('time-line-detail', true)
      .attr('stroke', '#444')
      .attr('stroke-opacity', 0.7)
      .attr('stroke-width', 1)
      .attr('fill', 'none')
      .merge(sel2)
      .attr('transform', `translate(0, ${this._detail_size[0]})`)
      .attr('x', this._detail_extent[0] - 5)
      .attr('width', this._detail_extent[1] - this._detail_extent[0] + 5)
      .attr('y', detail_y0)
      .attr('height', detail_y1 - detail_y0);
    sel2.exit().remove();
  }
};

class WildfireMapPane extends MapPane<DataManager<WildfireExtraInformation, WildfireTimelineDatum, WildfireMetadata>> {
  private _set_day: (day: Date) => void;

  private _selected_ids: Set<string> = new Set<string>();
  private _markers = new Map<string, [Polygon, T.Datum<WildfireTimelineDatum>]>();

  constructor(
    hc: DataManager<WildfireExtraInformation, WildfireTimelineDatum, WildfireMetadata>,
    map: LeafletMap,
    private _colors: ScaleThreshold<number, string>,
    private _colors_inactive: ScaleThreshold<number, string>,
    private _sizes: ScaleThreshold<number, number>,
    private _time_range: {start: Date, end: Date},
    private _day: string,
    private _day_format: (d: Date) => string,
    private _day_parse: (s: string) => Date,
    private _timeline: WildfireTimeline
  ) {
    super(hc, map);

    hc.on('radiuschange.map-circle', _ => this.refreshRadius());
    hc.on('detailchange.map-circle', _ => this.refreshRadius());

    this._set_day = this._timeline.setTime.bind(this._timeline);

    this.initMap();
  }

  protected updateMarkers(only_zoomed = false) {
    if (only_zoomed) return;

    console.time('MapPane::updateMarkers');

    const ref = this;
    const lod_data = this._data.lodData();

    const renderer = ref._renderer;

    // remove unneeded
    const new_ids = new Set<string>(lod_data.map(d => d.id));
    const delta = [];
    this._markers.forEach((_, k) => {
      if (!new_ids.has(k)) delta.push(k);
    });
    delta.forEach(d => {
      const [p,_] = this._markers.get(d);
      this._markers.delete(d);
      p.remove();
    });

    lod_data.forEach(datum => {
      if (!this._markers.has(datum.id)) {
        const lpolygon = polygon([
          datum.area.point_bl,
          datum.area.point_br,
          datum.area.point_tr,
          datum.area.point_tl
        ].map(([lng, lat]) => [lat,lng]), {
          renderer,
          fill: true,
          fillOpacity: 1,
          stroke: true,
          color: '#444',
          weight: 1,
          smoothFactor: 0,
        });

        lpolygon.bindTooltip('', {offset: [0, -15], direction: 'top'});

        lpolygon.on('click', function() {
          ref._data.focus(datum);
        }).on('mouseover', function(ev: LeafletMouseEvent) {
          ref._data.brush(datum);

          const visible = ref._data.elementIsSelected(datum);
          ref._data.showTooltip(visible);
          ref._data.moveTooltip({
            x: ev.originalEvent.clientX,
            y: ev.originalEvent.clientY
          });
        }).on('mouseout', function() {
          ref._data.brush(null)
          ref._data.showTooltip(false);
        }).on('mousemove', function(ev: LeafletMouseEvent) {
          ref._data.moveTooltip({
            x: ev.originalEvent.clientX,
            y: ev.originalEvent.clientY
          });
        });

        lpolygon.addTo(ref._marker_group);
        this._markers.set(datum.id, [lpolygon, datum]);
      }
    });
    this.updateMarkerStyles();

    console.timeEnd('MapPane::updateMarkers');
  }

  protected createLegendContent(div: HTMLDivElement): void {
    const ref = this;
    const thresholds = this._sizes.domain();

    select(div)
      .append('h4')
      .style('margin', '2px 4px')
      .text('FRP [MW]');

    const l = select(div)
      .style('background', 'white')
      .style('border', '1px solid #444')
      .append('svg')
      .classed('legend', true)
      .attr('width', 100)
      .attr('height', 15 * thresholds.length + 10)
      .append('g')
      .attr('transform', 'translate(5, 5)');
    thresholds.forEach((thresh, i) => {
      const delta = 15 * i;
      [[0, true], [80, false]].forEach(([x, unbrushed]: [number, boolean]) => {
        const pathdata = `m ${x} ${delta} l 12 0 0 12 -12 0 z`;
        l.append('g')
          .classed('wildfire-glyph', true)
          .classed('wildfire-glyph--selected', !unbrushed)
          .each(function() {
            const l = select(this);
            l.append('path')
              .attr('fill', (unbrushed ? ref._colors_inactive : ref._colors)(thresh))
              .attr('d', pathdata)
              .attr('stroke-width', 1)
              .attr('stroke', '#444');
          });
      });
      l.append('text')
        .html(`&ge;&thinsp;${thresholds[i]}`)
        .attr('x', 20)
        .attr('y', delta + 6)
        .attr('dy', 5)
        .attr('font-size', 12);
    });
  }

  protected createDaySelectorContent(div: HTMLDivElement): void {
    const ref = this;

    const pretty = timeFormat('%Y-%m-%d');
    const timeseries = this._time_range;
    const time_axis_overview = scaleTime<number, number>()
      .domain([timeseries.start, timeDay.offset(timeseries.end, -1)])
      .range([20, 280]);

    const animator = new SingleTimestepControl(timeDay, time_axis_overview.domain() as [Date, Date], 1);
    animator.on('change.check-day-changed', function(val: Date) {
      const day_str = ref._day_format(val);
      console.log('day changed', val, day_str);
      if (day_str !== ref._day) {
        ref._day = day_str;
        ref.updateMarkers();
        ref._set_day(val);
      }
    });

    const dv = select(div)
      .style('background', 'white')
      .style('border', '1px solid #444');
    const h4 = dv.append('h4')
      .style('margin', '2px 4px')
      .text('Map marker day');

    // update title when date changes
    animator.on('change.set-title', function(val: Date) {
      const pretty_day_str = pretty(val);
      h4.text(`Map marker day (${pretty_day_str})`);
    });

    // prev, next, play/pause buttons
    createControls(dv, animator);

    const l = dv.append('svg')
      .classed('legend', true)
      .attr('width', 300)
      .attr('height', 50);
    const xs = l.append('g')
      .attr('transform', 'translate(0, 20)');

    const x = axisBottom(time_axis_overview).tickFormat(timeFormat('%b'));
    xs.call(x);

    const handle = xs.append('path')
      .attr('transform', `translate(${time_axis_overview(timeseries.end)}, 0)`)
      .attr('d', 'M 0 0 l -5 -5 0 -10 10 0 0 10 z')
      .classed('timeline-handle', true)
      .attr('fill', 'darkblue');

    // update selected detail timespan
    const update = function([t0, t1]: [Date, Date]) {
      const xs_: [number, number] = <[number, number]>([t0,t1].map(time_axis_overview));
      const sel = xs
        .selectAll<SVGRectElement, [number, number]>('rect.detail-zoom-marker')
        .data([xs_]);
      sel.enter()
        .append('rect')
        .classed('detail-zoom-marker', true)
        .attr('fill', '#44a')
        .attr('opacity', 0.8)
        .merge(sel)
        .attr('y', 2)
        .attr('height', 2)
        .attr('x', ([x0, _]) => x0)
        .attr('width', ([x0, x1]) => x1-x0);
      sel.exit().remove();
    };
    update(time_axis_overview.domain() as [Date, Date]);
    this._timeline.on('detail-timespan-change.map-animator', update);

    const updateDayFromDrag = function(x: number) {
      const day = timeDay.round(time_axis_overview.invert(x));
      animator.setValue(day);
    };

    // function to reset handle to position
    const setHandleToPosition = (val: Date) => {
      const x = time_axis_overview(val);
      handle.attr('transform', `translate(${x}, 0)`);
    };
    animator.on('change.set-handle-position', setHandleToPosition);

    const _drag = drag()
      .on('start', function() {
        animator.stop();
        animator.on('change.set-handle-position', null);
        handle.classed('timeline-handle--grabbed', true);
      })
      .on('drag', function() {
        const x = Math.max(time_axis_overview.range()[0], Math.min(event.x, time_axis_overview.range()[1]));
        handle.attr('transform', `translate(${x}, 0)`);
        updateDayFromDrag(x);
      })
      .on('end', function() {
        handle.classed('timeline-handle--grabbed', false);
        const x = Math.max(time_axis_overview.range()[0], Math.min(event.x, time_axis_overview.range()[1]));
        animator.on('change.set-handle-position', setHandleToPosition);
        updateDayFromDrag(x);
      });

    // set day to click position day
    l.on('click', function() {
      const {clientX} = event;
      const {left} = l.node().getBoundingClientRect();
      const xpos = clientX - left;

      const day = timeDay.round(time_axis_overview.invert(xpos));
      animator.setValue(day);
    });

    handle.call(_drag);
    updateDayFromDrag(time_axis_overview.range()[1]);
  }

  onOverviewChange(): void {
    console.time('MapPane::onOverviewChange');

    // get new data
    this.updateMarkers();
    this.updatePaths();

    console.timeEnd('MapPane::onOverviewChange');
  }

  onDetailChange(): void {
    console.time('MapPane::onDetailChange');

    this._selected_ids = new Set<string>(this._data.detailData().map(d => d.name));
    this.updateMarkerStyles();

    console.timeEnd('MapPane::onDetailChange');
  }

  private updateMarkerStyles(): void {
    const day_idx = this._data.indexOfTimestamp(this._day_parse(this._day));
    this._markers.forEach(([poly,d], key) => {
      const data = d.data[day_idx];
      const active = this._selected_ids.has(key);
      const style = {
        weight: active ? 2 : 1,
        fillColor: active ? this._colors(data) : this._colors_inactive(data),
      };

      poly.setStyle(style);

      const data_unit = format('.3~s')(data * 1e6).replace(/(\d)([yzafpnµmkMGTPEZY]?$)/, '$1&thinsp;$2');

      poly.getTooltip().setContent(`${d.name}, ${this._day}: ${data_unit}W FRP`);
    });
  }

  onLink(id: string | null): void {
    this._markers.forEach(v => v[0].setStyle({color: '#444'}));
    if (id !== null) this._markers.get(id)[0].setStyle({color: 'blue'});
  }

  protected nexusCallback(): LatLngLiteral | null {
    return this._data.currentNexus();
  }

  protected radiusCallback(): number {
    return this._data.neighborhoodRadius(this._data.lod);
  }
};
