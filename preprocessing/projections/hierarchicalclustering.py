from util.quadtree import Point
from projections.projection import GeospatialProjection

from scipy.cluster.hierarchy import linkage, leaves_list
from scipy.spatial.distance import euclidean
import numpy as np


class HierarchicalClusteringProjection(GeospatialProjection):
    def add_data(self, data, method='single', metric='euclidean'):
        samples = np.ndarray(shape=(len(data), 2), dtype=float)
        for i,d in enumerate(data):
            samples[i,0] = self.x_fn(d)
            samples[i,1] = self.y_fn(d)

        if len(data) == 1:
            # distance matrix empty
            self.data = [ Point(samples[0,0], samples[0,1], data[0]) ]
            return

        Z = linkage(samples, method, metric)
        order = leaves_list(Z)

        self.data = [ Point(samples[i,0], samples[i,1], data[i]) for i in order ]


    def _order(self):
        return self.data


    def metadata(self):
        return dict()


class HierarchicalClusteringFlightdataProjection(GeospatialProjection):
    def add_data(self, data, flightdata=None, method='single'):
        samples = np.ndarray(shape=(len(data), 2), dtype=float)
        for i,d in enumerate(data):
            samples[i,0] = self.x_fn(d)
            samples[i,1] = self.y_fn(d)

        if len(data) == 1:
            # distance matrix empty
            self.data = [ Point(samples[0,0], samples[0,1], data[0]) ]
            return

        distances = np.zeros(shape=((len(data) * (len(data) - 1))//2,), dtype=float)
        idx = 0
        for i, a in enumerate(data):
            for j, b in enumerate(data[i+1:]):
                idx_a = flightdata['indices'].get(a.id, None)
                idx_b = flightdata['indices'].get(b.id, None)

                if idx_a is not None and idx_b is not None:
                    flow = flightdata['matrix'][idx_a * flightdata['size'] + idx_b]
                    if flow is not None and flow != 0:
                        distances[idx] = 1 / flow
                    else:
                        distances[idx] = euclidean(samples[i], samples[j])
                else:
                    distances[idx] = euclidean(samples[i], samples[j])

                idx += 1

        Z = linkage(distances, method)
        order = leaves_list(Z)

        self.data = [ Point(samples[i,0], samples[i,1], data[i]) for i in order ]


    def _order(self):
        return self.data


    def metadata(self):
        return dict()
