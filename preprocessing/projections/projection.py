import logging

import numpy as np
from datatypes.projection import Projection as ProjectionData
from datatypes.projection import SubtreeLevelOrder, PerLevelOrders
from projections.qualitymetrics import wrapper_for_d_matrix_calculation, \
    points_ordering_to_wildfire_structure, calculate_M1_M2_score, calculate_metric_stress, calculate_nonmetric_stress
from pyproj import CRS, Transformer
from pyproj.enums import TransformDirection


class Projection:
    def add_data(self, data):
        pass


    def _order(self):
        pass


    def order(self):
        o = self._order()
        self._point_data = np.zeros(shape=(len(o), 2), dtype=float)
        self._projection_order = np.ndarray(shape=(len(o),), dtype=int)

        for i, point in enumerate(o):
            self._point_data[i,0] = point.x
            self._point_data[i,1] = point.y
            self._projection_order[i] = i  # I just realized we don't really need the initial order anyways

        return o


    def metadata(self):
        return dict()


    def _calculate_quality_metrics(self, points, ordering, k_max, k_vec):
        '''
        Calculate and return quality metrics for the projection.

        @param points       A numpy.ndarray of shape (l, 2), where `points[i,0]`
                            is the x coordinate of point `i` (in EPSG3857), and
                            `points[i,1]` is the y coordinate. `l` is the
                            number of entities in the projection.

        @param ordering     An array of indices of shape (l,). The order of the
                            indices is the projection, and the indices
                            reference the first index in `points`.

        @param k_max        Maximum `k` for neighborhood graph

        @param k_vec        Boolean: True -> use mean of multiple measurements
                            with different `k`
        '''
        if len(points) <= 2:
            # one or two samples: normalized distances should not change
            M1, M2 = [1], [1]
            metric_stress = 0
            nonmetric_stress = 0

        else:
            data, data_proj = points_ordering_to_wildfire_structure(points, ordering)

            # calculate distance matrix for rank caluclations
            d_org = wrapper_for_d_matrix_calculation(data)
            d_proj = wrapper_for_d_matrix_calculation(data_proj)

            d_org_max = np.max(d_org.distance_matrix)
            d_proj_max = np.max(d_proj.distance_matrix)

            assert (d_org_max > 0)
            assert (d_proj_max > 0)

            # plus one so that the last value is <= N/2
            vec = np.arange(1, min(k_max, len(points)//2 + 1), 1) if k_vec else [min(k_max, len(points)//2)]

            M1, M2 = calculate_M1_M2_score(data, data_proj, d_org, d_proj, vec)
            metric_stress = calculate_metric_stress(d_org.distance_matrix/d_org_max, d_proj.distance_matrix/d_proj_max)
            nonmetric_stress = calculate_nonmetric_stress(d_org.distance_matrix, d_proj.distance_matrix)

        if len(M1) == 0:
            print(points)
            print(ordering)
            print(M1, M2)

        return dict(metric_stress=metric_stress, nonmetric_stress=nonmetric_stress, M1=np.mean(M1), M2=np.mean(M2))


    def quality(self, k_max, k_vec):
        return self._calculate_quality_metrics(self._point_data, self._projection_order, k_max, k_vec)


class GeospatialProjection(Projection):
    def __init__(self):
        super().__init__()

        crs = CRS.from_epsg(3857)
        self.proj = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)

        self.x_fn = lambda datum: self.proj.transform(datum.lng, datum.lat, errcheck=True)[0]
        self.y_fn = lambda datum: self.proj.transform(datum.lng, datum.lat, errcheck=True)[1]


    def metadata(self):
        x0 = self.quadtree.root.x0
        y0 = self.quadtree.root.y0
        x1 = self.quadtree.root.x1
        y1 = self.quadtree.root.y1

        points = self.proj.transform(
                [x0, x0, x1, x1],
                [y0, y1, y1, y0],
                direction=TransformDirection.INVERSE
                )

        pts = [ {"lat": p[1], "lng": p[0] } for p in zip(*points) ]
        return dict(grid_cell=pts)


def create_projection(projection_class, data, key=None, name=None, description=None, k_max=5, k_vec=True, **kwargs):
    '''
    Create a <projection> object from a <datum>[] forest.
    '''
    if key is None:
        key = projection_class.__name__

    per_level = dict()
    # get root level order

    p = projection_class()
    p.add_data(data, **kwargs)
    root_order = list(map(lambda x: x.data.id, p.order()))
    slo = {
            '@@ROOT@@': SubtreeLevelOrder(order=root_order, **p.metadata(), **p.quality(k_max, k_vec))
        }
    per_level[0] = slo

    # others
    for child in data:
        if child.children is not None and len(child.children) > 0:
            _create_recursive_level_orders(projection_class, child, 1, per_level, k_max, k_vec, **kwargs)
        elif child.children is not None and len(child.children) == 0:
            logging.warn('    Subtree %s has empty child array.', child.name)

    per_level = [ PerLevelOrders(**per_level[idx]) for idx in range(len(per_level)) ]

    # create total ordering
    total_order = []
    def _do_total(sequence, depth):
        for item in sequence:
            total_order.append(item)

            if depth >= len(per_level):
                continue

            if item in per_level[depth].__dict__:
                _do_total(per_level[depth].__dict__[item].order, depth+1)
    _do_total(root_order, 1)

    return ProjectionData(key=key, name=name, description=description, total_order=total_order, per_level=per_level)


def _create_recursive_level_orders(projection_class, subtree, depth, per_level, k_max, k_vec, **kwargs):
    p = projection_class()
    p.add_data(subtree.children, **kwargs)
    order = SubtreeLevelOrder(order=list(map(lambda x: x.data.id, p.order())), **p.metadata(), **p.quality(k_max, k_vec))

    if depth not in per_level:
        per_level[depth] = dict()
    per_level[depth].update({subtree.id: order})

    for child in subtree.children:
        if child.children is not None and len(child.children) > 0:
            _create_recursive_level_orders(projection_class, child, depth+1, per_level, k_max, k_vec, **kwargs)
        elif child.children is not None and len(child.children) == 0:
            logging.warn('    Subtree %s has empty child array.', child.name)

