import { format } from 'd3-format';
import { range } from 'd3-array';
import {
  Selection,
  select,
  event
} from 'd3-selection';

import {Tooltip} from './tooltip';
import {Projection} from './types';

export type CurveIdentifier = string;

interface RadiusCallable {
  reorder(tp: CurveIdentifier): void;
  neighborhoodRadius(d: number): number;
  neighborhoodRadius(d: number, e: number): any;
  notifyRadiusChange(d: number, e: number): any;

  createControlCurveComparison(tooltip: Tooltip, id: Projection);

  projections: Projection[];
  currentParentName(): string;
  current_strategy: CurveIdentifier;

  toggleProjectionSortBy(key: string);
  compareProjections(a: Projection, b: Projection): number;
  projection_sort_key: string;
  projection_sort_asc: boolean;
  focusProjection(projection: string | null);

  depth: number;
  lod: number;
};

const fmt = format('.4f');

export class Controls {
  private _control_div: Selection<HTMLDivElement, any, any, any>;
  private _hc: RadiusCallable;
  private _tooltip: Tooltip | null = null;

  constructor(
    control_div: Selection<HTMLDivElement, any, any, any>,
    hc: RadiusCallable
  ) {
    this._control_div = control_div;
    this._hc = hc;

    this.initCurveSelector(this._hc.projections);
  }

  private initCurveSelector(projs: Projection[]): void {
    const ref = this;

    ['M1', 'M2', 'metric_stress', 'nonmetric_stress'].forEach(qual => {
      this._control_div
        .select<HTMLDivElement>('.curve-type-selector')
        .select<HTMLDivElement>('.grid')
        .select<HTMLDivElement>('.curve-types__header')
        .select<HTMLSpanElement>(`span.${qual}`)
        .on('click', function() {
          ref._hc.toggleProjectionSortBy(qual);

          ref.updateCurveCells();
        })
        .on('mouseenter', function() {
          ref._tooltip?.clear();
          ref._tooltip = new Tooltip();
          ref._tooltip.root
            .append('div')
            .classed('tooltip__qualitymetric', true)
            .html(require(`html-loader!../html/${qual}.template.html`));
          ref._tooltip.show();
        })
        .on('mousemove', ref.onCurveMove.bind(ref))
        .on('mouseleave', function() {
          ref._tooltip?.clear();
          ref._tooltip = null;
        });
    });

    const sel = this._control_div
      .select<HTMLDivElement>('.curve-type-selector')
      .select<HTMLDivElement>('.grid')
      .selectAll<HTMLDivElement, CurveIdentifier>('input')
      .data(projs);
    sel.enter()
      .append('div')
      .classed('curve-type-selector', true)
      .classed('row', true)
      .on('mousemove', ref.onCurveMove.bind(ref))
      .on('mouseenter', (d) => ref.onCurveHoverStart(d))
      .on('mouseleave', () => ref.onCurveHoverEnd())
      .each(function(d, i) {
        const input = select(this)
          .append('input')
          .attr('type', 'radio')
          .attr('name', 'curve-type')
          .attr('id', `curve-type-${i}`)
          //.style('grid-template-row', `${i+1} / span 1`)
          .on('change', () => {
            ref._hc.reorder(d.key);
          });
        if (d.key === ref._hc.current_strategy) input.node().checked = true;
        select(this)
          .append('label')
          .classed('title', true)
          .attr('for', `curve-type-${i}`);

        ['M1', 'M2', 'metric_stress', 'nonmetric_stress'].forEach(qual => {
          select(this)
            .append('span')
            .classed(qual, true);
        });
      });
    sel.exit().remove();

    this.updateCurveCells();
  }

  private updateCurveCells() {
    const ref = this;

    const lod = ref._hc.lod;
    const parent_id = ref._hc.currentParentName();
    const sort_by_quality = this._hc.projection_sort_key;
    const sort_asc = this._hc.projection_sort_asc;

    this._control_div
      .select<HTMLDivElement>('.curve-type-selector')
      .select<HTMLDivElement>('.grid')
      .select('.curve-types__header')
      .selectAll<HTMLSpanElement, any>('span')
      .attr('data-state', function() {
        if (this.classList.contains(sort_by_quality)) {
          return `sort-${sort_asc ? 'ascending' : 'descending'}`;
        } else return null;
      });

    this._control_div
      .select<HTMLDivElement>('.curve-type-selector')
      .select<HTMLDivElement>('.grid')
      .selectAll<HTMLDivElement, Projection>('.curve-type-selector')
      .each(function(datum, i) {
        const sel = select(this);
        sel.select('label.title').html(datum.name);
        ['M1', 'M2', 'metric_stress', 'nonmetric_stress'].forEach(qual => {
          sel.select(`span.${qual}`)
            .text(fmt(datum.per_level[lod][parent_id][qual]))
            .style('--data-quality', datum.per_level[lod][parent_id][qual]);
        });
      })
      .sort(ref._hc.compareProjections.bind(ref._hc));
  }

  private onCurveHoverStart(curve: Projection) {
    if (this._tooltip !== null) this.onCurveHoverEnd();

    this._tooltip = new Tooltip();
    this.onCurveMove();
    this._hc.focusProjection(curve.key);

    this._hc.createControlCurveComparison(this._tooltip, curve);
  }

  private onCurveHoverEnd() {
    this._tooltip.clear();
    this._tooltip = null;
    this._hc.focusProjection(null);
  }

  private onCurveMove() {
    if (this._tooltip !== null) this._tooltip.move({
      x: event.clientX,
      y: event.clientY
    });
  }

  onOverviewChange(): void {
    // highlight current depth
    this._control_div.select<HTMLDivElement>('.reorder-radius-selector')
      .selectAll<HTMLDivElement, [number, number]>('.radius-selector')
      .attr('data-state', ([idx, _]) => (idx === this._hc.lod) ? 'active' : null);

    this.updateCurveCells();
  }

  onDepthChange(): void {
    const ref = this;

    const d = this._hc.depth;
    const ds = range(d).map(e => [e, this._hc.neighborhoodRadius(e)]);

    const sel = this._control_div.select<HTMLDivElement>('.reorder-radius-selector')
      .selectAll<HTMLDivElement, [number, number]>('.radius-selector')
      .data(ds, ([idx, _]) => idx.toString());
    sel.enter()
      .append('div')
      .classed('radius-selector', true)
      .each(function([idx, r]) {
        const div = select(this)
          .attr('data-state', (idx === 0) ? 'active' : null);
        div.append('span').text(`Level ${idx}`);
        div.append('input')
          .attr('type', 'range')
          .attr('min', 0)
          .attr('max', 1000)
          .attr('step', 1)
          .attr('value', r)
          .on('change', function([idx,_]) {
            ref._hc.neighborhoodRadius(idx, this.valueAsNumber);
          })
          .on('input', function([idx, _]) {
            ref._hc.notifyRadiusChange(idx, this.valueAsNumber);
          });
      })
      .merge(sel)
      .each(function(d) {
        const onchange = this.onchange;
        this.onchange = null;
        select(this)
          .attr('value', d[1]);
        this.onchange = onchange;
      });
    sel.exit().remove();
  }
};

