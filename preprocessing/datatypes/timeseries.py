import json
import datetime
from .serializable import Serializable, print_tree


class TimeseriesSpecification(Serializable):
    def __init__(self, fmt, start, end, series=None):
        self.format = fmt
        self.start = start
        self.end = end
        self.series = series


    @property
    def __dict__(self):
        d = dict(
                format=self.format,
                start=self.start.strftime(self.format),
                end=self.end.strftime(self.format)
                )

        if self.series is not None:
            d['series'] = [ t.strftime(self.format) for t in self.series ]

        return d


    @classmethod
    def from_json(cls, obj):
        fmt = obj['format']
        start = datetime.datetime.strptime(obj['start'], fmt)
        end = datetime.datetime.strptime(obj['end'], fmt)
        if 'series' in obj and obj['series'] is not None:
            series = [ datetime.datetime.strptime(t, fmt) for t in obj['series'] ]
        else:
            series = None

        return cls(fmt, start, end, series)


if __name__ == '__main__':
    fmt = '%Y-%m-%d'

    ts = TimeseriesSpecification(fmt,
            datetime.datetime(2020, 1, 1),
            datetime.datetime(2020, 1, 8),
            [
                datetime.datetime(2020, 1, 1),
                datetime.datetime(2020, 1, 2),
                datetime.datetime(2020, 1, 3),
                datetime.datetime(2020, 1, 4),
                datetime.datetime(2020, 1, 5),
                datetime.datetime(2020, 1, 6),
                datetime.datetime(2020, 1, 7),
                datetime.datetime(2020, 1, 8),
            ])

    print_tree(ts)
    print()

    j = json.dumps(ts, default=lambda x: x.__dict__, sort_keys=True, indent=2)
    print(j)
    print()

    tsx = TimeseriesSpecification.from_json(json.loads(j))
    print_tree(tsx)

