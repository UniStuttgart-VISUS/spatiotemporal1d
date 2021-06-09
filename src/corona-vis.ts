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
import { CircleMarker, GeoJSON, LatLngExpression, LatLngLiteral, LeafletMouseEvent, circleMarker, geoJSON, map, Map as LeafletMap } from 'leaflet';

import * as T from './types';
import DataManager from './data-manager';
import {Controls} from './controls';
import MapPane from './map-pane';
import Timeline from './timeline';
import {SingleTimestepControl,createControls} from './time-control';

type CoronaExtraInformation = {
  fields: string[];
};
type CoronaTimelineDatum = number[];
type CoronaMetadata = {};
export type Data = T.DataSet<CoronaExtraInformation, CoronaTimelineDatum, CoronaMetadata>;

export default class Visualization {
  private _concept: DataManager<CoronaExtraInformation, CoronaTimelineDatum, CoronaMetadata>;

  private _timeline: CoronaTimeline;
  private _map: CoronaMapPane;
  private _controls: Controls;

  private _show_active_cases: boolean = false;

  private toggleActive() {
    this._show_active_cases = !this._show_active_cases;
    this._timeline.showActiveCases(this._show_active_cases);
    this._map.showActiveCases(this._show_active_cases);

    this._timeline.onOverviewChange();
    this._map.onOverviewChange();
  }

  constructor(url: string) {
    this.loadData(url);
  }

  private async loadData(url: string) {
    console.time('Visualization::loadData');
    const _json: T.DataSetRaw<CoronaExtraInformation, CoronaTimelineDatum, CoronaMetadata> = await json(url);
    const parsed = await this.parseData(_json);
    await this.init(parsed);
    console.timeEnd('Visualization::loadData');

    this._concept.resumeEvents();
    this._timeline.setTime(parsed.timeseries.end);
  }

  private async parseData({data,timeseries,visualization,metadata,projections}: T.DataSetRaw<CoronaExtraInformation, CoronaTimelineDatum, CoronaMetadata>): Promise<Data> {
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
    }).setView([40, 0], 2);

    const is_rki = (new URL(location.href).searchParams.get('vis') === 'corona_rki');
    // hotfix to center map on Germany for that dataset
    if (is_rki) lmap.fitBounds([[47.3, 5.9], [55, 15]]);

    const parse = timeParse(data.timeseries.format);
    const fmt = timeFormat(data.timeseries.format);
    const time_span: [Date, Date] = [data.timeseries.start, timeDay.offset(data.timeseries.end)];

    const day = timeFormat(data.timeseries.format)(data.timeseries.end);

    const __steps = is_rki ? range(1, 10) : range(1, 7);
    const thresholds = is_rki ? __steps.map(d => Math.pow(5, d-1)) : __steps.map(d => Math.pow(10, d-1));
    const radii = [0].concat(__steps.map(d => d*2+0.5));
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
    const hc = new DataManager<CoronaExtraInformation, CoronaTimelineDatum, CoronaMetadata>();
    const ext: [number, number] = [90, width - 50];
    hc.overviewExtent(ext)
      .detailExtent(ext)
      .overviewMaxElementWidth(10)
      .detailMaxElementWidth(100)
      .overviewGap(1)
      .detailGap(10);
    await hc.data(data);

    select(':root').classed('corona', true);

    // create timeline
    this._timeline = new CoronaTimeline(
      svg, hc, parse, fmt,
      time_span,
      colors, colors_muted, data.timeseries,
      lmap.distance.bind(lmap),
      ext, ext,
      height
    );
    hc.on('overviewchange.timeline', () => this._timeline.onOverviewChange());
    hc.on('detailchange.timeline', () => this._timeline.onDetailChange());

    // create map
    this._map = new CoronaMapPane(hc, lmap, colors, colors_muted, sizes, data.timeseries, day, fmt, parse,this._timeline, () => this.toggleActive());
    hc.on('overviewchange.map', () => this._map.onOverviewChange());
    hc.on('detailchange.map', () => this._map.onDetailChange());

    this._concept = hc;
    hc.distance_fn = ((a, b) => lmap.distance(a, b) / 1000);

    hc.on('link.map', this._map.onLink.bind(this._map));
    hc.on('focus-projection.map', d => this._map.onProjectionFocus(d));

    // create controls
    this._controls = new Controls(select<HTMLDivElement, any>('.controls'), hc);

    // sensible cutoff radii
    [1000, 500, 100, 50].forEach((radius, index) => hc.neighborhoodRadius(index, radius));
    this._controls.onDepthChange();
    hc.on('depthchange.controls', this._controls.onDepthChange.bind(this._controls));
    hc.on('overviewchange.controls', this._controls.onOverviewChange.bind(this._controls));
  }
};

class CoronaTimeline extends Timeline<CoronaExtraInformation, CoronaTimelineDatum, CoronaMetadata> {
  private _old_detail_extent_x: number = 0;
  private _old_detail_extent_active_x: number = 0;

  private _cases_normalized_idx: number = 0;
  private _active_normalized_idx: number = 0;

  private _show_active_cases: boolean = false;

  constructor(
    svg: Selection<SVGSVGElement, any, any, any>,
    hc: DataManager<CoronaExtraInformation, CoronaTimelineDatum, CoronaMetadata>,
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

    this._cases_normalized_idx = this._hc.indexOfAttribute('cases_normalized');
    this._active_normalized_idx = this._hc.indexOfAttribute('active_normalized');

    // minimap: get color
    this._minimap.fillColorCallback = (
      datum: T.Datum<CoronaTimelineDatum>,
      time: Date,
      brushed: boolean
    ) => {
      const d = datum.data[this._hc.indexOfTimestamp(time)]?.[
        this._show_active_cases
        ? this._active_normalized_idx
        : this._cases_normalized_idx
      ];
      if (d === undefined) return 'lightgrey';
      if (brushed) {
        return this._color_scale(d);
      } else {
        return this._color_scale_muted(d);
      }
    };
  }

  protected drawOverviewDatum(
    context: CanvasRenderingContext2D,
    datum: T.Datum<CoronaTimelineDatum>,
    x_range: [number, number]
  ): void {
    const x = x_range[0];
    const w = x_range[1] - x;

    const attr_index = this._show_active_cases
        ? this._active_normalized_idx
        : this._cases_normalized_idx;

    this._hc.timeseries.forEach((day, i) => {
      const count = datum.data[i][attr_index];
      context.fillStyle = (count !== undefined) ? this._color_scale(count) : 'lightgrey';
      const y0 = this._time_axis_overview.range()[0];
      const y1 = this._time_axis_overview(day);
      const y2 = this._time_axis_overview(timeDay.offset(day));
      context.fillRect(x, y1-y0, w, y2-y1);
    });
  }

  protected prepareDetailDrawing(
    data: T.Datum<CoronaTimelineDatum>[],
    extent_x: [number, number],
    extent_y: [number, number]
  ): any {
    // cases, deaths, tested, growthFactor, recovered, active
    // cases_normalized: grey
    // tested: dark yellow
    // active: green
    // deaths: red
    //
    const [min, max] = this._time_axis_detail.domain();
    const idx0 = this._hc.indexOfTimestamp(min);
    const idx1 = this._hc.indexOfTimestamp(timeDay.offset(max, -1));

    let min_val = 0;
    let max_val = 1;
    let max_val_active = 1;

    const idx_range = range(idx0, idx1+1);

    data.forEach(datum => {
      idx_range.forEach(idx => {
        const cn = datum.data[idx][this._cases_normalized_idx];
        const an = datum.data[idx][this._active_normalized_idx];

        if (cn !== undefined) max_val = Math.max(max_val, cn);
        if (an !== undefined) max_val_active = Math.max(max_val_active, an);
      });
    });
    const data_extent = [min_val, max_val];
    const data_extent_active = [min_val, max_val_active];

    if (max_val !== this._old_detail_extent_x || max_val_active !== this._old_detail_extent_active_x) {
      this._old_detail_extent_x = max_val;
      this._old_detail_extent_active_x = max_val_active;
      this._detail_redraw_flag = true;
    }

    const scale_x = scaleLinear()
      .domain(data_extent)
      .range(extent_x)
      .nice();
    const axis_x = axisBottom(scale_x)
      .ticks(2);

    const scale_x_active = scaleLinear()
      .domain(data_extent_active)
      .range(extent_x)
      .nice();
    const axis_x_active = axisTop(scale_x_active)
      .ticks(2);

    return {scale_x, axis_x, axis_x_active, scale_x_active, idx_range};
  }

  protected drawDetailDatum(
    g: Selection<SVGGElement, any, any, any>,
    context: CanvasRenderingContext2D,
    prepared: any,
    scale_y: ScaleTime<number, number>,
    datum: T.Datum<CoronaTimelineDatum>
  ): void {
    const {scale_x, axis_x, scale_x_active, axis_x_active, idx_range} = prepared;

    // data
    const [min, max] = this._time_axis_detail.domain();

    const get_data = (data_idx, xscale) => idx_range.map(idx => {
      const d = datum.data[idx][data_idx];
      if (d === undefined || isNaN(d) || d === null) return null;
      const date = this._hc.timeseries[idx];
      return [xscale(d), scale_y(date)] as [number, number];
      }).filter(d => d !== null);  // TODO split on null instead

    const cases_normalized = get_data(this._cases_normalized_idx, scale_x);
    const active = get_data(this._active_normalized_idx, scale_x_active);

    // draw x axis
    g.append('g')
    .classed('x-axis', true)
    .attr('transform', `translate(0, ${scale_y.range()[1]})`)
    .call(axis_x)
    .each(function() {
      select(this)
        .selectAll('text')
        .style('text-anchor', 'start')
        .attr('transform', 'rotate(45 0 8)');
    });
    if (active.length) {
      g.append('g')
        .classed('x-axis', true)
        .attr('transform', `translate(0, ${scale_y.range()[1]})`)
        .call(axis_x_active)
        .each(function() {
          select(this)
            .selectAll('text')
            .style('text-anchor', 'start')
            .attr('transform', 'rotate(-45 0 -8)');
        });
    }

    const draw_data = (data, color) => {
      if (data.length === 0) return;
      const [x0, y0] = data[0];

      // fill area
      context.fillStyle = color;
      context.strokeStyle = 'none';
      context.lineWidth = 0;
      context.globalAlpha = 0.1;

      context.beginPath();
      context.moveTo(scale_x.range()[0], y0);
      data.forEach(([x,y]) => context.lineTo(x,y));
      context.lineTo(scale_x.range()[0], data[data.length - 1][1]);
      context.fill();

      // draw line
      context.fillStyle = 'none';
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.globalAlpha = 1;

      context.beginPath();
      context.moveTo(x0, y0);

      data.forEach(([x, y]) => {
        context.lineTo(x, y);
      });
      context.stroke();
    };

    draw_data(cases_normalized, 'grey');
    draw_data(active, 'green');
  }

  setTimePost(): void {
    const t = this._current_time;

    this._minimap.timeChanged(t);
    const overview_y0 = this._time_axis_overview(t) || 0;
    const overview_y1 = this._time_axis_overview(timeDay.offset(t)) || 0;

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
    const detail_y0 = detail_scale(t) || 0;
    const detail_y1 = detail_scale(timeDay.offset(t)) || 0;

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

  showActiveCases(active: boolean) {
    this._show_active_cases = active;
  }
};

class CoronaMapPane extends MapPane<DataManager<CoronaExtraInformation, CoronaTimelineDatum, CoronaMetadata>> {
  private _time_range: {start: Date, end: Date};

  private _day_format: ((d: Date) => string);
  private _day: string;
  private _set_day: (day: Date) => void;

  private _cases_idx: number = 0;
  private _active_idx: number = 0;
  private _cases_normalized_idx: number = 0;
  private _active_normalized_idx: number = 0;

  private _show_active_cases: boolean = false;

  private _selected_ids: Set<string> = new Set<string>();
  private _markers = new Map<string, [CircleMarker | GeoJSON, T.Datum<number[]>]>();

  constructor(
    hc: DataManager<CoronaExtraInformation, CoronaTimelineDatum, CoronaMetadata>,
    map: LeafletMap,
    private _colors: ScaleThreshold<number, string>,
    private _colors_muted: ScaleThreshold<number, string>,
    private _sizes: ScaleThreshold<number, number>,
    time_range: {start: Date, end: Date},
    day: string,
    day_format: (d: Date) => string,
    private _day_parse: (s: string) => Date,
    private _timeline: CoronaTimeline,
    private _toggle_callback: () => void,
  ) {
    super(hc, map);

    hc.on('radiuschange.map-circle', _ => this.refreshRadius());
    hc.on('detailchange.map-circle', _ => this.refreshRadius());

    this._cases_idx = this._data.indexOfAttribute('cases');
    this._active_idx = this._data.indexOfAttribute('active');
    this._cases_normalized_idx = this._data.indexOfAttribute('cases_normalized');
    this._active_normalized_idx = this._data.indexOfAttribute('active_normalized');

    this._time_range = time_range;

    this._day = day;
    this._day_format = day_format;
    this._set_day = this._timeline.setTime.bind(this._timeline);

    this.initMap();
  }

  protected updateMarkers() {
    const lod_data = this._data.lodData();
    const ref = this;

    const attr_nonnorm_index = this._show_active_cases
        ? ref._active_idx
        : ref._cases_idx;
    const attr_index = this._show_active_cases
        ? ref._active_normalized_idx
        : ref._cases_normalized_idx;
    const day_idx = this._data.indexOfTimestamp(this._day_parse(this._day));
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
        const circle = ('geojson' in datum)
          ? geoJSON(datum.geojson)
          : circleMarker(datum);

        circle.setStyle({
          renderer,
          fill: true,
          fillOpacity: 1,
          stroke: true,
          color: '#444',
          weight: 1,
        });
        circle.bindTooltip('', {offset: [0, -15], direction: 'top'});

        circle.on('click', function() {
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

        circle.addTo(ref._marker_group);
        this._markers.set(datum.id, [circle, datum]);
      }
    });

    this.updateMarkerStyles();
  }

  private updateMarkerStyles(): void {
    const attr_nonnorm_index = this._show_active_cases
        ? this._active_idx
        : this._cases_idx;
    const attr_index = this._show_active_cases
        ? this._active_normalized_idx
        : this._cases_normalized_idx;

    const day_idx = this._data.indexOfTimestamp(this._day_parse(this._day));
    this._markers.forEach(([circ,d], key) => {

      const active = this._selected_ids.has(key);

      const datum_full = d.data[day_idx];
      const datum = datum_full[attr_index];
      const nonnormalized = datum_full[attr_nonnorm_index];

      const nonnorm = (nonnormalized === null) ? '?' : format(',.0f')(nonnormalized);
      const normalized = (datum === null) ? '?' : format(',.3f')(datum);
      const text = `${d.name}, ${this._day}: ${nonnorm}${this._show_active_cases ? ' active': ''} cases (${normalized} per 1M capita)`;
      circ.getTooltip().setContent(text);

      const radius = Math.max(3, this._sizes(datum));
      const fillColor = (datum !== null) ? (active ? this._colors(datum) : this._colors_muted(datum)) : '#bbb';
      const fillOpacity = (datum !== null) ? 1 : 0.8;
      const weight = active ? 2 : 1;

      if (circ instanceof CircleMarker) {
        circ.setRadius(radius);
        circ.setStyle({fillColor, fillOpacity, weight});
      } else {
        // XXX
        circ.setStyle({fillColor, fillOpacity, weight});
      }
    });

    // reorder by size
    const ms = [];
    this._markers.forEach(([m, _], id) => {
      if (m instanceof CircleMarker) {
        m.remove();
        ms.push([m,id]);
      }
    });
    ms.sort((a,b) => ((+this._selected_ids.has(b[1])) - (+this._selected_ids.has(a[1]))) || (b[0].getRadius() - a[0].getRadius()));
    ms.forEach(m => m[0].addTo(this._marker_group));
  }


  protected createLegendContent(div: HTMLDivElement): void {
    const ref = this;
    const is_rki = (new URL(location.href).searchParams.get('vis') === 'corona_rki');

    const radii = this._sizes.range();
    const thresholds = this._sizes.domain();

    const d = select(div);
    d.append('h4')
      .classed('legend-heading', true)
      .style('margin', '2px 4px')
      .text('Confirmed Cases')
      .on('click', () => ref._toggle_callback());

    d.append('span')
      .style('margin', '2px 4px')
      .style('display', 'block')
      .style('font-weight', 'lighter')
      .text('per 1M capita');

    const l = select(div)
      .style('background', 'white')
      .style('border', '1px solid #444')
      .append('svg')
      .classed('legend', true)
      .attr('width', is_rki ? 100 : 120)
      .attr('height', is_rki ? (15 * thresholds.length + 10) : (2 * sum(radii) + 12*(thresholds.length) + 2*12))
      .append('g')
      .attr('transform', is_rki ? 'translate(5, 5)' : 'translate(20, 20)');

    thresholds.forEach((thresh, i) => {
      const r = radii[i+1];
      const delta = is_rki ? 15 * i : 2 * sum(radii.slice(0, i)) + 12*i;
      [[0, true], [80, false]].forEach(([x, unbrushed]: [number, boolean]) => {
        if (is_rki) {
          const pathdata = `m ${x} ${delta} l 12 0 0 12 -12 0 z`;
          l.append('path')
            .attr('fill', (unbrushed ? ref._colors_muted : ref._colors)(thresh))
            .attr('d', pathdata)
            .attr('stroke-width', 1)
            .attr('stroke', '#444');
        } else {
          l.append('circle')
            .attr('fill', (unbrushed ? ref._colors_muted : ref._colors)(thresh))
            .attr('cx', x)
            .attr('cy', delta+r)
            .attr('r', r)
            .attr('stroke-width', 1)
            .attr('stroke', '#444');
        }
      });
      l.append('text')
        .html(is_rki ? `&ge;&thinsp;${format('.2s')(thresholds[i])}` : `&ge;&thinsp;${format('.1s')(thresholds[i])}`)
        .attr('x', 20)
        .attr('y', is_rki ? (delta + 6) : (delta + r))
        .attr('dy', 5)
        .attr('font-size', 12);
    });

    l.append('path')
      .attr('stroke', 'green')
      .attr('stroke-width', 2)
      .attr('d', `M -10 ${12*(thresholds.length-1) + 2*sum(radii) - 8} l 20 0`);
    l.append('path')
      .attr('stroke', 'grey')
      .attr('stroke-width', 2)
      .attr('d', `M -10 ${12*(thresholds.length-1) + 2*sum(radii) + 6} l 20 0`);
    l.append('text')
        .html(`active / 1M`)
        .attr('x', 20)
        .attr('y', 12*(thresholds.length-1) + 2*sum(radii) - 8)
        .attr('dy', 5)
        .attr('font-size', 12);
    l.append('text')
        .html('cases / 1M')
        .attr('x', 20)
        .attr('y', 12*(thresholds.length-1) + 2*sum(radii) + 6)
        .attr('dy', 5)
        .attr('font-size', 12);
  }

  protected createDaySelectorContent(div: HTMLDivElement): void {
    const ref = this;

    const pretty = timeFormat('%Y-%m-%d');
    const timeseries = this._time_range;
    const time_axis_overview = scaleTime<number, number>()
      .domain([timeseries.start, timeseries.end])
      .range([20, 280]);

    const animator = new SingleTimestepControl(timeDay, time_axis_overview.domain() as [Date, Date], 1);
    animator.on('change.check-day-changed', function(val: Date) {
      const day_str = ref._day_format(val);
      if (day_str !== ref._day) {
        ref._day = day_str;
        ref.updateMarkerStyles();
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
        const x = Math.max(time_axis_overview.range()[0], Math.min(event.x, time_axis_overview(timeseries.end)));
        handle.attr('transform', `translate(${x}, 0)`);
        updateDayFromDrag(x);
      })
      .on('end', function() {
        handle.classed('timeline-handle--grabbed', false);
        const x = Math.max(time_axis_overview.range()[0], Math.min(event.x, time_axis_overview(timeseries.end)));
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

    handle.call(_drag);
    updateDayFromDrag(time_axis_overview(timeseries.end));
  }

  onOverviewChange(): void {
    // get new data
    this.updateMarkers();
    this.updatePaths();
  }

  onDetailChange(): void {
    this._selected_ids = new Set<string>(this._data.detailData().map(d => d.id));
    this.updateMarkerStyles();
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

  showActiveCases(active: boolean) {
    select('h4.legend-heading').text(active ? 'Active Cases' : 'Confirmed Cases');
    this._show_active_cases = active;
  }
};
