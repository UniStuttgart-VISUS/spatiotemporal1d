from .serializable import Serializable, print_tree


class SubtreeLevelOrder(Serializable):
    def __init__(self, order, **kwargs):
        self.order = order
        for k,v in kwargs.items():
            self.__dict__[k] = v


class PerLevelOrders(Serializable):
    def __init__(self, **kwargs):
        for k,v in kwargs.items():
            self.__dict__[k] = v


    @classmethod
    def from_json(cls, obj):
        subtree_level_orders = { k: SubtreeLevelOrder.from_json(v) for k, v in obj.items() }
        return cls(**subtree_level_orders)


class Projection(Serializable):
    def __init__(self, key, name, description, total_order, per_level):
        self.key = key
        self.name = name
        self.description = description
        self.total_order = total_order
        self.per_level = per_level


    @classmethod
    def from_json(cls, obj):
        per_level = [ PerLevelOrders.from_json(v) for v in obj['per_level'] ]
        obj['per_level'] = per_level
        return cls(**obj)





if __name__ == '__main__':
    import json

    p = Projection('test', ['a', 'b', 'c', 'd'], [
        PerLevelOrders(**{'@@ROOT@@': dict(order=['a', 'c'], testvalue='heyy')}),
        PerLevelOrders(**{'a': dict(order=['b'], comment='x'), 'c': dict(order=['d'], comment='test')})
        ])

    print_tree(p)

    j = json.dumps(p, default=lambda o: o.__dict__, sort_keys=True, indent=2)
    print(j)

    p2 = Projection.from_json(json.loads(j))
    print_tree(p2)
