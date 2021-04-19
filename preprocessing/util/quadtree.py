import math
from functools import namedtuple

Point = namedtuple('Point', ('x', 'y', 'data'))


class Node:
    def __init__(self, x0, y0, x1, y1, datum):
        self.x0 = x0
        self.x1 = x1
        self.y0 = y0
        self.y1 = y1

        self.datum = datum
        self.children = None


class Quadtree:
    def __init__(self, x0, y0, x1, y1):
        self.root = Node(x0, y0, x1, y1, None)

    def add_point(self, p):
        if math.isnan(p.x) or math.isnan(p.y) or math.isinf(p.x) or math.isinf(p.y):
            import sys, json
            sys.stderr.write(F'Invalid coordinates for {p}\n')

            json.dump(p.data, sys.stderr, indent=2, default=lambda x: x.__dict__)
            sys.exit(1)


        try:
            _recursive_add_point(self.root, p)
        except RecursionError:
            import sys, json
            sys.stderr.write(F'Recursion Error @ {p}\n')
            sys.stderr.write(F'  {p.data.name, p.data.lat, p.data.lng}\n')
            sys.stderr.write(F'  Root {self.root.x0} {self.root.y0} {self.root.x1} {self.root.y1}\n')

            sys.stderr.write('Tree:\n')
            def rec(node):
                if node.datum is not None:
                    sys.stderr.write(F'  {node.datum.data.name}, {node.datum.data.lat}, {node.datum.data.lng}, {node.datum.x}, {node.datum.y}\n')
                elif node.children is not None:
                    for child in node.children:
                        rec(child)
            rec(self.root)

            sys.exit(1)



def _recursive_add_point(node, point):
    if node.children is None and node.datum is None:
        # empty leaf node
        node.datum = point

    elif node.children is None:
        # occupied leaf node
        x0 = node.x0
        x1 = node.x1
        y0 = node.y0
        y1 = node.y1
        w = x1 - x0
        h = y1 - y0

        # split
        node.children = [
            Node(x0, y0, x0 + w/2, y0 + h/2, None),
            Node(x0 + w/2, y0, x1, y0 + h/2, None),
            Node(x0, y0 + h/2, x0 + w/2, y1, None),
            Node(x0 + w/2, y0 + h/2, x1, y1, None)
            ]
        oldchild = node.datum
        node.datum = None

        # add both points
        _recursive_add_point(node, oldchild)
        _recursive_add_point(node, point)

    else:
        # non-leaf node
        #
        # 0 | 1
        # -----
        # 2 | 3
        #
        xm = (node.x1 + node.x0) / 2
        ym = (node.y1 + node.y0) / 2

        idx = 0
        if point.x >= xm:
            idx += 1
        if point.y >= ym:
            idx += 2

        _recursive_add_point(node.children[idx], point)

