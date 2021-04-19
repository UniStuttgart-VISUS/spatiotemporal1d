from operator import attrgetter

from util.quadtree import Quadtree, Point
from projections.projection import GeospatialProjection


class MortonProjection(GeospatialProjection):
    def add_data(self, data):
        self.data = [ Point(self.x_fn(d), self.y_fn(d), d) for d in data ]

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
        _visit_quadtree_node(order, self.quadtree.root)
        return order


def _visit_quadtree_node(curve, node):
    if node.children is not None:
        for child in node.children:
            _visit_quadtree_node(curve, child)

    elif node.datum is not None:
        curve.append(node.datum)

