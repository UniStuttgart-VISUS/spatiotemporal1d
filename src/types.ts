export type Extent = [number, number];

export interface Geoloc {
  lng: number;
  lat: number;
};

export interface GeoRect {
  northeast: Geoloc;
  southwest: Geoloc;
};

type _PointHenry = [number, number];
export interface GeoRectHenry {
  point_bl: _PointHenry;
  point_br: _PointHenry;
  point_tr: _PointHenry;
  point_tl: _PointHenry;
};

/////////////////////////////////////////////////
// RELIGION
/////////////////////////////////////////////////
export interface ReligionCoexistenceSpan {
  start: number;
  end: number;
  count: number;
  religion_ids: number[];
};
export interface ReligionSpan {
  start: number;
  end: number;
  religion_id: number;
  comment: string | null;
};
export interface SpanData {
  spans: ReligionSpan[];
  coexistence_spans: ReligionCoexistenceSpan[];
};
export type ReligionDatum = PlaceInformation
                          & {
                            place_id: number;
                            data: SpanData
                          };

export interface ReligionData {
  timeseries: {
    format: string;
    start: Date;
    end: Date;
  };
  data: Array<ReligionDatum>;
};

export type PlaceInformation = { name: string; id: string; } & Geoloc;

export type UnparsedTimeSeriesData<T> = { [key: string]: T };
export type ParsedTimeSeriesData<T> = Map<string, T>;

export interface CoronaTimePoint {
  cases: number;
  active?: number;
  cases_normalized: number;
  active_normalized?: number;
};

export type UnparsedExtendedCoronaTimeseriesData = UnparsedTimeSeriesData<CoronaTimePoint>;
export type ParsedExtendedCoronaTimeseriesData = ParsedTimeSeriesData<CoronaTimePoint>;

export type UnparsedCoronaDatum = PlaceInformation & { data: UnparsedExtendedCoronaTimeseriesData };
export interface UnparsedCoronaData {
  timeseries: {
    format: string;
    start: string;
    end: string;
  };
  data: Array<UnparsedCoronaDatum>;
};

export type CoronaDatum = PlaceInformation & { data: ParsedExtendedCoronaTimeseriesData };
export interface CoronaData {
  timeseries: {
    format: string;
    start: Date;
    end: Date;
  };
  data: Array<CoronaDatum>;
};

// wildfire data
export interface UnparsedWildfireTimeseriesData {
  [key: string]: number;
};
export interface ParsedWildfireTimeseriesData {
  raw: [Date, number][];
  by_day: Map<string, number>;
};
export type UnparsedWildfireDatum = PlaceInformation & { data: UnparsedWildfireTimeseriesData };
export type WildfireDatum = PlaceInformation & { data: ParsedWildfireTimeseriesData };

export interface UnparsedWildfireData {
  timeseries: {
    format: string;
    start: string;
    end: string;
  };
  data: Array<UnparsedWildfireDatum>;
};
export interface WildfireData {
  timeseries: {
    format: string;
    start: Date;
    end: Date;
  };
  data: Array<WildfireDatum>;
};

// hierarchized data
export interface GeographicallyAggregatedData<T> {
  data: T;            // aggregated
  level?: number;
  region_id_top?: number;
  lat: number;
  lng: number;
  area: GeoRectHenry;
  name: string;
  id?: string;
};
export type HierarchizedAggregatedData<T> = GeographicallyAggregatedData<T> & { children?: HierarchizedAggregatedData<T>[] | null };



/// new
//
interface _BareSubtreeLevelOrder {
  order: string[];
};

interface SubtreeLevelOrderExtraAttributes {
  // quality metrics
  metric_stress: number;
  nonmetric_stress: number;
  M1: number;
  M2: number;

  [key: string]: any;
};

export type SubtreeLevelOrder = _BareSubtreeLevelOrder & SubtreeLevelOrderExtraAttributes;

export interface PerLevelOrders {
  [parent_id: string]: SubtreeLevelOrder;
};

export interface Projection {
  key: string;
  name: string;
  description: string;
  total_order: string[];
  per_level: PerLevelOrders[];
};

export interface Datum<TimeSeriesDatum> {
  id: string;
  name: string;
  lat: number;
  lng: number;
  data: TimeSeriesDatum[];
  children?: Datum<TimeSeriesDatum>[];
  [key: string]: any;
};

export interface TimeSeriesSpecificationRaw {
  format: string;
  start: string;
  end: string;
  series?: string[];
};
export interface TimeSeriesSpecification {
  format: string;
  start: Date;
  end: Date;
  series?: Date[];
};

export interface DataSet<
  DatasetSpecificInstructions extends {},
  TimeSeriesDatum,
  Metadata extends {}
> {
  timeseries: TimeSeriesSpecification;
  visualization: DatasetSpecificInstructions;
  data: Datum<TimeSeriesDatum>[];
  metadata: Metadata;
  projections: Projection[];
};

export interface DataSetRaw<
  DatasetSpecificInstructions extends {},
  TimeSeriesDatum,
  Metadata extends {}
> {
  timeseries: TimeSeriesSpecificationRaw;
  visualization: DatasetSpecificInstructions;
  data: Datum<TimeSeriesDatum>[];
  metadata: Metadata;
  projections: Projection[];
};

