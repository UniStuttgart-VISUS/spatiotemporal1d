import random
import sys
import os

# include parent dir
sys.path.insert(1, os.path.join(sys.path[0], '..'))

from util.quadtree import Quadtree, Point
from util.plot_quadtree import plot_quadtree
from projections.hilbert import _visit_quadtree_node as visit_hilbert
from projections.morton import _visit_quadtree_node as visit_morton

if __name__ == '__main__':
    q = Quadtree(0, 0, 100, 100)
    for i in range(400):
        x = random.uniform(0, 100)
        y = random.uniform(0, 100)

        q.add_point(Point(x, y, i))

    order = []
    visit_hilbert(order, q.root, 0, 'A')

    points = (list(map(lambda x: x.x, order)), list(map(lambda x: x.y, order)))

    plot_quadtree(q, curve=points)

    order = []
    visit_morton(order, q.root)

    points = (list(map(lambda x: x.x, order)), list(map(lambda x: x.y, order)))

    plot_quadtree(q, curve=points)
