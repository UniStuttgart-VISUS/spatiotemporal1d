interface _BareSubtreeLevelOrder {
  order: string[];
};

export type SubtreeLevelOrder<SubtreeLevelOrderExtraAttributes extends {}> = _BareSubtreeLevelOrder & SubtreeLevelOrderExtraAttributes;

export interface PerLevelOrders<SubtreeLevelOrderExtraAttributes extends {}> {
  [parent_id: string]: SubtreeLevelOrder<SubtreeLevelOrderExtraAttributes>;
};

export interface Projection<SubtreeLevelOrderExtraAttributes extends {}> {
  name: string;
  total_order: string[];
  per_level: PerLevelOrders<SubtreeLevelOrderExtraAttributes>[];
};

export interface Datum<TimeSeriesDatum> {
  id: string;
  name: string;
  lat: number;
  lng: number;
  data: TimeSeriesDatum[];
  children?: Datum<TimeSeriesDatum>[];
};

export interface TimeSeriesSpecification {
  format: string;
  start: string;
  end: string;
  series?: string[];
};

export interface DataSet<
  DatasetSpecificInstructions extends {},
  TimeSeriesDatum,
  Metadata extends {},
  SubtreeLevelOrderExtraAttributes extends {}
> {
  timeseries: TimeSeriesSpecification;
  visualization: DatasetSpecificInstructions;
  data: Datum<TimeSeriesDatum>[];
  metadata: Metadata;
  projections: Projection<SubtreeLevelOrderExtraAttributes>[];
};

