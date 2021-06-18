from projections.projection import GeospatialProjection
from util.quadtree import Point

from umap import UMAP


class UMAPProjection(GeospatialProjection):
    def add_data(self, data, n_neighbors=10, metric='euclidean', **kwargs):
        self.kwargs = kwargs

        if len(data) == 1:
            self.data = [ Point(self.x_fn(data[0]), self.y_fn(data[0]), data[0]) ]
            return

        self.data = list()

        pointdata = [[self.x_fn(d), self.y_fn(d)] for d in data]

        fit = UMAP(n_neighbors=n_neighbors, n_components=1, metric=metric)
        u = fit.fit_transform(pointdata)
        orderable = [(i,x[0]) for i, x in enumerate(u)]
        orderable.sort(key=lambda x: x[1])
        for i,_ in orderable:
            self.data.append(Point(self.x_fn(data[i]), self.y_fn(data[i]), data[i]))


    def _order(self):
        return self.data


    def metadata(self):
        return dict()



