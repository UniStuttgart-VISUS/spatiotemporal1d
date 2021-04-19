
class Serializable:

    @classmethod
    def from_json(cls, obj):
        return cls(**obj)


    def __str__(self):
        s = F'{type(self).__name__} @ {id(self)}\n'
        for k, v in self.__dict__.items():
            s += F'{k} -> {v}\n'

        return s


def print_tree(obj, indent=2):
    if type(obj) in (bool, str, chr, int, float, complex):
        print(F'({type(obj).__name__}) {obj}')
    elif obj is None:
        print('None')
    elif type(obj) in (list, tuple):
        print(F'{type(obj).__name__}:')
        for k in obj:
            print(' '*indent, end='')
            print_tree(k, indent=indent+2)
    else:
        if type(obj) is dict:
            d = obj
        else:
            d = obj.__dict__
        print(F'{type(obj).__name__}:')
        for k, v in d.items():
            print(' '*indent, end='')
            print(F'{k} = ', end='')
            print_tree(v, indent=indent+2)
