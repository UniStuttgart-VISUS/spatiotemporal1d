import {Quadtree, QuadtreeInternalNode, QuadtreeLeaf} from 'd3-quadtree';

export function dataInRadius<_Tp>(
  quad: Quadtree<_Tp>,
  datum: _Tp,
  radius: number,
  distance_fn: ((a: _Tp, b: _Tp) => number)
): _Tp[] {
  const x_fn = quad.x();
  const y_fn = quad.y();
  const x = x_fn(datum);
  const y = y_fn(datum);

  const in_radius: _Tp[] = [];

  const visitor = (node: QuadtreeInternalNode<_Tp> | QuadtreeLeaf<_Tp>, x0: number, y0: number, x1: number, y1: number) => {
    // cell cannot contain any data in given radius
    if ((x1 < x - radius) || (x0 > x + radius) || (y1 < y - radius) || (y0 > y + radius)) return true;

    // node has children. recurse into, but there is no data here
    if (node.length) return false;

    // cell could contain data in radius. check exact distance
    if (distance_fn((<QuadtreeLeaf<_Tp>>node).data, datum) <= radius) in_radius.push((<QuadtreeLeaf<_Tp>>node).data);
  };

  quad.visit(visitor);

  return in_radius;
}
