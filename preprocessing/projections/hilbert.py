from math import isnan, isinf
from operator import attrgetter

from util.quadtree import Quadtree, Point
from projections.projection import GeospatialProjection


class HilbertProjection(GeospatialProjection):
    def add_data(self, data):
        self.data = [ Point(self.x_fn(d), self.y_fn(d), d) for d in data ]

        unwell = list(filter(lambda p: isnan(p.x) or isnan(p.y) or isinf(p.x) or isinf(p.y), self.data))
        if len(unwell) > 0:
            import sys
            sys.stderr.write('Points with invalid coordinates:\n')
            for w in unwell:
                sys.stderr.write(F'  {w.data.name}  {w.data.lat} {w.data.lng}\n')

            sys.exit(1)

        getx = attrgetter('x')
        gety = attrgetter('y')

        min_x = min(map(getx, self.data))
        max_x = max(map(getx, self.data))
        min_y = min(map(gety, self.data))
        max_y = max(map(gety, self.data))

        # squarify domain
        dx = max_x - min_x
        dy = max_y - min_y
        if dx > dy:
            delta = dx - dy
            min_y -= delta/2
            max_y += delta/2
        else:
            delta = dy - dx
            min_x -= delta/2
            max_x += delta/2

        self.quadtree = Quadtree(min_x, min_y, max_x, max_y)

        for datum in self.data:
            self.quadtree.add_point(datum)


    def _order(self):
        order = []
        _visit_quadtree_node(order, self.quadtree.root, 0, 'A')
        return order


def _visit_quadtree_node(curve, node, rotation, pattern):
    if node.children is not None:
        order = _lindenmayer[pattern]
        for pat, rot, idx_unrot in order:
            idx = _rotations[rotation][idx_unrot]
            if node.children[idx].children is None and node.children[idx].datum is None:
                continue

            _visit_quadtree_node(curve, node.children[idx], (rotation + rot + 4)%4, pat)

    else:
        curve.append(node.datum)


_lindenmayer = {
        'A': [
            ('B', -1, 0),
            ('A', 0, 2),
            ('A', 0, 3),
            ('B', 1, 1)
            ],
        'B': [
            ('A', 1, 1),
            ('B', 0, 3),
            ('B', 0, 2),
            ('A',-1, 0)
            ]
        }
_rotations = [
        [0, 1, 2, 3],
        [1, 3, 0, 2],
        [3, 2, 1, 0],
        [2, 0, 3, 1]
        ]
