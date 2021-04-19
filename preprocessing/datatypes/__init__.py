import json
from operator import attrgetter

from .datum import Datum
from .timeseries import TimeseriesSpecification as _TimeseriesSpecification
from .projection import SubtreeLevelOrder as _SubtreeLevelOrder, \
        PerLevelOrders as _PerLevelOrders, \
        Projection as _Projection
from .serializable import Serializable


# export namespace
TimeseriesSpecification = _TimeseriesSpecification
SubtreeLevelOrder = _SubtreeLevelOrder
PerLevelOrders = _PerLevelOrders
Projection = _Projection


class Dataset(Serializable):
    def __init__(self, timeseries, visualization, data, metadata, projections):
        self.timeseries = timeseries
        self.visualization = visualization
        self.data = data
        self.metadata = metadata
        self.projections = projections


    @classmethod
    def from_json(cls, obj):
        timeseries = TimeseriesSpecification.from_json(obj['timeseries'])
        visualization = obj['visualization']
        data = [ Datum.from_json(t) for t in obj['data'] ]
        metadata = obj['metadata']
        projections = [ Projection.from_json(p) for p in obj['projections'] ]

        return cls(timeseries, visualization, data, metadata, projections)


    def to_json(self, out, **kwargs):
        return json.dump(self, out, default=attrgetter('__dict__'), **kwargs)
