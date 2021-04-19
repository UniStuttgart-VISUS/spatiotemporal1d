from projections.projection import GeospatialProjection
from util.quadtree import Point

from scipy.cluster.hierarchy import linkage, leaves_list
import numpy as np
from tslearn.metrics import dtw

import logging


class DTWProjection(GeospatialProjection):
    def timeseries_comparison(self, ts1, ts2):
        return 0.0


    def add_data(self, data, tslen=1, tsfunc=lambda x: x.data, method='single', **kwargs):
        self.kwargs = kwargs

        if len(data) == 1:
            self.data = [ Point(self.x_fn(data[0]), self.y_fn(data[0]), data[0]) ]
            return

        samples = np.ndarray(shape=(len(data), tslen), dtype=float)
        for i in range(len(data)):
            samples[i] = tsfunc(data[i])

        distances = np.zeros(shape=((len(data) * (len(data) - 1))//2,), dtype=float)
        idx = 0
        for i, a in enumerate(samples):
            for b in samples[i+1:]:
                distances[idx] = self.timeseries_comparison(a, b, **kwargs)
                idx += 1

        Z = linkage(distances, method)
        order = leaves_list(Z)

        self.data = []
        for i in order:
            d = data[i]
            self.data.append(Point(self.x_fn(d), self.y_fn(d), d))


    def _order(self):
        return self.data


    def metadata(self):
        return dict()


class DynamicTimeWarpingProjection(DTWProjection):
    def timeseries_comparison(self, X0, X1, global_constraint=None):
        return 1.0 / (1.0 + dtw(X0, X1, global_constraint=global_constraint))


    def metadata(self):
        if self.kwargs['global_constraint'] is None:
            return dict()
        return dict(global_constraint=self.kwargs['global_constraint'])

