import { HierarchyNode, HierarchyRectangularNode, PartitionLayout, hierarchy, partition } from 'd3-hierarchy';
import { Selection, select, event } from 'd3-selection';
import { ScaleLinear, scaleLinear } from 'd3-scale';
import { bisector, range } from 'd3-array';

import * as T from './types';
import DataManager from './data-manager';

const root_hierarchy_node_name: string = '@@ROOT@@';

enum ZoomBehavior {
  None,
  Parent,
  RootParent,
};

export default class Minimap<_Type> {
  private _tree: HierarchyNode<{id:string}>;
  private _partition: PartitionLayout<{id:string}>;
  private _partition_result: HierarchyRectangularNode<{id:string}>;
  private _active_node: HierarchyRectangularNode<{id:string}>;
  private _tree_nodes: HierarchyRectangularNode<{id: string}>[];

  private _time: Date;

  private _x_scale_total: ScaleLinear<number, number>;
  private _x_scale: ScaleLinear<number, number>;
  private _y_scale: ScaleLinear<number, number>;

  private _active_stroke_style: string = 'blue';

  private _data_by_id: Map<string, T.Datum<_Type>> = new Map<string, T.Datum<_Type>>();

  private _zoom_behavior: ZoomBehavior = ZoomBehavior.None;

  constructor(
    private _g: Selection<SVGGElement, any, any, any>,
    private _canvas: HTMLCanvasElement,
    private _width: number,
    private _height: number,
    private _hc: DataManager<any, _Type, any>
  ) {
    this._x_scale_total = scaleLinear<number, number>()
      .range([0, this._width]);
    this._x_scale = scaleLinear<number, number>()
      .range([0, this._width]);
    this._y_scale = scaleLinear<number, number>()
      .range([0, this._height]);

    this.createTree();

    this._hc.on('link.minimap', this.onLink.bind(this));
    this.initInteraction();
  }

  private createTree(): void {
    const total_data = this._hc.rootData();
    const create_tree = (d: any) => {
      this._data_by_id.set(d.id, d);
      const node = {
        id: d.id,
        children: d.children ? d.children.map(create_tree) : null
      };
      return node;
    };

    const root = create_tree({id: root_hierarchy_node_name, children: total_data});
    this._tree = hierarchy<{id: string}>(root);

    this._partition = partition<{id: string}>()
      .size([1, this._tree.height+1]);

    this.reorderTree();
  }

  private reorderTree(): void {
    this._tree
      .sort((a,b) => this._hc._data_order_lut(b.data.id) - this._hc._data_order_lut(a.data.id))
      .sum(d => 1);

    this._partition_result = this._partition(this._tree);
    this._tree_nodes = this._partition_result.descendants().filter(d => d.depth > 0); // ignore dummy node
  }

  structureChanged(): void {
    // XXX: massive memory leak was here, probably fixed now
    this.reorderTree();

    this._y_scale.domain([1, this._tree.height+1]);

    const active_name = this._hc.currentParentName();
    if (active_name === root_hierarchy_node_name) {
      this._active_node = this._partition_result;
    } else {
      this._active_node = this._tree_nodes.filter(d => d.data.id === active_name)[0];
    }

    const parents = this._hc.drilldown_path;
    const labels: [number, string][] = range(0, this._hc.depth)
      .map(d => {
        const name = (d >= parents.length) ? `Level ${d}` : parents[d];
        return [d,name];
      });

    const paths = select('body>svg')
      .select('defs')
      .selectAll<SVGPathElement, [number, string]>('path')
      .data(labels);
    paths.enter()
      .append('path')
      .attr('id', d => `label-path-${d[0]}`)
      .merge(paths)
      .attr('d', d => `M -85 ${this._y_scale(d[0]+1) + 7} l 80 0`);
    paths.exit().remove();

    const label_sel = this._g.selectAll<SVGTextElement, [number, string]>('text.label')
      .data(labels);

    label_sel.enter()
      .append('text')
      .classed('label', true)
      .attr('font-size', 10)
      .each(function(d) {
        select(this).append('textPath');
        select(this).append('title');
      })
    .merge(label_sel)
      .each(function(d) {
        select(this)
          .select('textPath')
          .attr('xlink:href', `#label-path-${d[0]}`)
          .text(d => d[1])
        select(this)
          .select('title')
          .text(d[1]);
      })
      .attr('data-state', d => (d[0] === this._hc.lod) ? 'active' : null);

    label_sel.exit().remove();

    this.paint();
  }

  brushingChanged(): void {
    this.paint();
  }

  private _last_brushed: T.Datum<_Type>;
  private onMouseMove(): void {
    const datum = this.elementAtEventPosition();
    if (datum !== this._last_brushed) {
      this._last_brushed = datum;
      this._hc.brush(datum || null);
    }
  }

  private onMouseClick(): void {
    const datum = this.elementAtEventPosition();
    this._hc.focus(datum || null);
  }

  private elementAtEventPosition(): T.Datum<_Type> | null {
    const {clientX, clientY, target} = event;
    const {top,left} = target.getBoundingClientRect();
    const x = clientX - left;
    const y = clientY - top;

    const level = Math.floor(this._y_scale.invert(y));
    if (level !== this._active_node.depth + 1) {
      return null;
    }

    const domain_x = this._x_scale.invert(x);
    // find element at x
    const indexRightOf = bisector<HierarchyRectangularNode<{id: string}>, number>(d => d.x0).right;
    const idx = indexRightOf(this._active_node.children || [], domain_x) - 1;

    if (idx == -1) return null;
    return this._data_by_id.get(this._active_node.children[idx].data.id) || null;
  }

  private initInteraction(): void {
    this._g.append('rect')
      .attr('opacity', 0)
      .attr('x', this._x_scale_total.range()[0])
      .attr('y', this._y_scale.range()[0])
      .attr('width', this._x_scale_total.range()[1] - this._x_scale_total.range()[0])
      .attr('height', this._y_scale.range()[1] - this._y_scale.range()[0])
      .on('mousemove', _ => this.onMouseMove())
      .on('mouseleave', _ => {
        this._last_brushed = null;
        this._hc.brush(null);
      })
      .on('click', _ => this.onMouseClick());

    const ref = this;
    select<HTMLSelectElement, any>('.controls .minimap-zoom-control select#zoom-type')
      .each(function() { this.value = 'none'; })
      .on('change', function() {
        let new_value: ZoomBehavior = ZoomBehavior.None;
        if (this.value === 'none') new_value = ZoomBehavior.None;
        else if (this.value === 'parent') new_value = ZoomBehavior.Parent;
        else if (this.value === 'root-parent') new_value = ZoomBehavior.RootParent;

        if (new_value !== ref._zoom_behavior) {
          ref._zoom_behavior = new_value;
          ref.paint();
        }
      });
  }

  private onLink(id: string | null): void {
    const linked = this._tree_nodes.filter(d => d.data.id === id);
    const sel = this._g.selectAll<SVGRectElement, HierarchyRectangularNode<T.Datum<_Type>>>('rect.hierarchy-link-indicator')
      .data(linked);
    sel.enter()
      .append('rect')
      .classed('hierarchy-link-indicator', true)
      .merge(sel)
      .attr('x', d => this._x_scale(d.x0))
      .attr('y', d => this._y_scale(d.y0))
      .attr('width', d => this._x_scale(d.x1) - this._x_scale(d.x0))
      .attr('height', d => this._y_scale(d.y1) - this._y_scale(d.y0));
    sel.exit().remove();
  }

  private updateXScale() {
    switch (this._zoom_behavior) {
      case ZoomBehavior.None:
        this._x_scale.domain([0,1]);
        break;

      case ZoomBehavior.Parent:
        this._x_scale.domain([this._active_node.x0, this._active_node.x1]);
        break;

      case ZoomBehavior.RootParent:
        let parent = this._active_node;
        let x0 = parent.x0;
        let x1 = parent.x1;
        while (parent?.data?.id !== root_hierarchy_node_name) {
          x0 = parent.x0;
          x1 = parent.x1;
          parent = parent.parent;
        }

        this._x_scale.domain([x0,x1]);
        break
    }
  }

  private paint(): void {
    if (this._time === undefined || this._active_node === undefined) return;

    console.time('Minimap::paint');
    this.updateXScale();

    const brushed_data = this._hc.detailData();
    const brushed_lut = new Set<string>(brushed_data.map(d => d.id));

    const context = this._canvas.getContext('2d');
    context.clearRect(0, 0, this._canvas.width, this._canvas.height);

    // fill background white / grey hierarchically
    context.strokeStyle = 'none';
    let visitor = (node) => {
      const x0 = this._x_scale(node.x0);
      const x1 = this._x_scale(node.x1);
      const y0 = this._y_scale(node.y0);
      const y1 = this._y_scale(node.y1);

      context.rect(x0, y0, x1-x0, y1-y0);
    };

    let i = 0;
    context.beginPath();
    context.fillStyle = 'white';
    this._tree.children.forEach(child => child.each(c => { if (i%2==0) visitor(c); ++i; }));
    context.fill();

    i = 0;
    context.beginPath();
    context.fillStyle = 'rgb(240,240,240)';
    this._tree.children.forEach(child => child.each(c => { if (i%2==1) visitor(c); ++i; }));
    context.fill();

    // prepare all rects
    const rects_per_color = new Map<string, [number, number, number, number][]>();
    const even: [number, number, number, number][] = [];
    const odd: [number, number, number, number][] = [];
    this._tree_nodes.forEach((node, i) => {
      const nodedata = this._data_by_id.get(node.data.id);
      const fill = this.fillColorCallback(nodedata, this._time, brushed_lut.has(nodedata.id));
      const x0 = this._x_scale(node.x0);
      const x1 = this._x_scale(node.x1);
      const y0 = this._y_scale(node.y0) + 7;
      const y1 = this._y_scale(node.y1) - 7;

      const d: [number, number, number, number] = [x0, y0, x1-x0, y1-y0];
      if (rects_per_color.has(fill)) rects_per_color.get(fill).push(d);
      else rects_per_color.set(fill, [d]);
    });

    // fill all rects
    rects_per_color.forEach((vals, color) => {
      context.beginPath();
      context.fillStyle = color;
      vals.forEach(val => context.rect(...val));
      context.fill();
    });

    // mark current subtree
    const x0 = this._x_scale(this._active_node.x0);
    const x1 = this._x_scale(this._active_node.x1);
    const y0 = this._y_scale(this._active_node.y0+1);
    const y1 = this._y_scale(this._active_node.y1+1);
    const rect = this._g.selectAll<SVGRectElement, any>('rect.current-subtree')
      .data([{x0,y0,x1,y1}]);
    rect.enter()
      .append('rect')
      .classed('current-subtree', true)
      .attr('fill', 'none')
      .attr('stroke', this._active_stroke_style)
      .attr('stroke-width', 1)
      .attr('x', ({x0}) => x0)
      .attr('y', ({y0}) => y0)
      .attr('width', ({x0, x1}) => x1-x0)
      .attr('height', ({y0, y1}) => y1-y0)
      .merge(rect)
      .attr('x', ({x0}) => x0)
      .attr('y', ({y0}) => y0)
      .attr('width', ({x0, x1}) => x1-x0)
      .attr('height', ({y0, y1}) => y1-y0)
    rect.exit().remove();

    console.timeEnd('Minimap::paint');
  }

  timeChanged(time: Date): void {
    this._time = time;

    if (this._tree_nodes !== undefined) this.paint();
  }

  declare fillColorCallback: ((datum: T.Datum<_Type>, time: Date, _brushed: boolean) => string);

  set activeStrokeStyle(style: string) {
    this._active_stroke_style = style;
  }
};
