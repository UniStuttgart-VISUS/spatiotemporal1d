from .serializable import Serializable, print_tree


class Datum(Serializable):
    def __init__(self, id, name, lat, lng, data, children=None, **kwargs):
        self.id = id
        self.name = name
        self.lat = lat
        self.lng = lng
        self.data = data
        self.children = children

        for k,v in kwargs.items():
            self.__dict__[k] = v


    @classmethod
    def from_json(cls, obj):
        if 'children' in obj and obj['children'] is not None:
            obj['children'] = [ Datum.from_json(o) for o in obj['children'] ]

        return cls(**obj)


if __name__ == '__main__':
    import json
    d1 = Datum('12d1', 'name 12', 54.1, 53.1, [1,2,3,4,5], None, tag='hai')
    d2 = Datum('12d2', 'name 12', 5.1, 53.1, [1,2,35], None, tag='hau')
    d3 = Datum('12d3', 'name 12', 54.1, 5.1, [1,2,4,5], None, tag='hja')
    d = Datum('12', 'name 12', 54.1, 53.1, [1,2,3,4,5], [d1, d2, d3], tag='hey')

    print_tree(d)
    print()

    j = json.dumps(d, default=lambda o: o.__dict__, sort_keys=True, indent=2)
    print(j, '\n')

    d2 = Datum.from_json(json.loads(j))
    print_tree(d2)
