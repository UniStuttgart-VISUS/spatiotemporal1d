import {
  Canvas,
  Circle,
  Control,
  DomEvent,
  DomUtil,
  LatLngLiteral,
  LayerGroup,
  Map as LeafletMap,
  Polyline,
  TileLayerOptions,
  canvas,
  circle,
  layerGroup,
  polyline,
  tileLayer
} from 'leaflet';
import {CurveIdentifier} from './controls';
import * as HC from './data-manager';
import {Projection} from './types';

interface CurvePathProvider {
  projections: Projection[];
  order_path(strategy: string): LatLngLiteral[];

  timeseries: Date[];
  indexOfTimestamp(timestamp: Date): number;
  indexOfAttribute(attr: string): number;
}

export default abstract class MapPane<_Tp extends CurvePathProvider> {
  protected _map: LeafletMap;
  private _order_paths: Map<string, LatLngLiteral[]> = new Map<string, LatLngLiteral[]>();

  protected _data: _Tp;

  protected readonly _marker_group: LayerGroup;
  protected readonly _renderer: Canvas = canvas();
  private _path: Polyline;

  constructor(
    data: _Tp,
    map: LeafletMap,
  ) {
    this._data = data;
    this._map = map;

    this._marker_group = layerGroup();
  }

  protected abstract updateMarkers(only_zoomed?: boolean): void;
  protected abstract nexusCallback(): LatLngLiteral | null;
  protected abstract radiusCallback(): number;

  protected initMap() {
    // add tile layer
    tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(this._map);

    this._marker_group.addTo(this._map);

    this.addLegend();
    this.addDaySelector();
  }

  protected applyToSvg(svg: SVGSVGElement): void {

  }

  protected onLink(id: string | null): void {

  }

  private _circle: Circle | null = null;
  refreshRadius() {
    // delete old
    this._circle?.remove();
    this._circle = null;

    const pos = this.nexusCallback();
    if (pos === null) return;

    const r = this.radiusCallback();
    this._circle = circle(pos, {
      radius: r * 1000,
      color: '#444',
      weight: 1,
      fill: false
    });

    this._circle.addTo(this._map);
  }

  protected abstract createLegendContent(div: HTMLDivElement): void;

  private addLegend() {
    const ref = this;

    const legend = new Control({position: 'bottomleft'});
    legend.onAdd = function(_) {
      const div = DomUtil.create('div', 'legend');
      ref.createLegendContent(<HTMLDivElement>div);
      return div;
    };
    legend.addTo(this._map);
  }

  protected abstract createDaySelectorContent(div: HTMLDivElement): void;

  private addDaySelector() {
    const ref = this;

    const selector = new Control({position: 'topright'});
    selector.onAdd = function(_) {
      const div = DomUtil.create('div', 'day-selector');
      DomEvent.disableClickPropagation(div);
      ref.createDaySelectorContent(<HTMLDivElement>div);
      return div;
    };

    selector.addTo(this._map);
  }

  protected abstract onOverviewChange();
  protected abstract onDetailChange();

  onProjectionFocus(projection: string | null) {
    if (projection === null) {
      this._path?.remove();
      this._path = null;
    } else {
      const path = this._order_paths.get(projection);
      this._path = polyline(path,
        {
          stroke: true,
          color: 'red',
          weight: 2,
          renderer: this._renderer,
        });
      this._path.addTo(this._marker_group)
    }
  }

  protected updatePaths() {
    this._data.projections.forEach(proj => {
      this._order_paths.set(proj.key, this._data.order_path(proj.key));
    });
  }
};
