from projections.projection import GeospatialProjection
from util.quadtree import Point

from scipy.cluster.hierarchy import linkage, leaves_list
import numpy as np
from tslearn.metrics import dtw

import logging


class FirstOccurrenceProjection(GeospatialProjection):
    @staticmethod
    def first_occurrence_index(ts, threshold=0):
        i = 0
        while i < len(ts) and ts[i] is not None and ts[i] <= threshold:
            i += 1
        return i

    def add_data(self, data, tslen=1, tsfunc=lambda x: x.data, **kwargs):
        self.kwargs = kwargs

        if len(data) == 1:
            self.data = [ Point(self.x_fn(data[0]), self.y_fn(data[0]), data[0]) ]
            return

        maxval = max([max(tsfunc(d)) for d in data])
        threshold = maxval * 0.01

        order = [ (d, FirstOccurrenceProjection.first_occurrence_index(tsfunc(d), threshold)) for d in data ]
        order = sorted(order, key=lambda x: x[1])

        self.data = []
        for d,_ in order:
            self.data.append(Point(self.x_fn(d), self.y_fn(d), d))


    def _order(self):
        return self.data


    def metadata(self):
        return dict()

