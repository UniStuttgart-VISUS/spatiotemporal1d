from math import sqrt

import geopandas as gpd
import matplotlib.pyplot as plt
import networkx as nx
import numpy as np
import pandas as pd
import scipy.stats as ss
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import pairwise_distances
from sklearn.neighbors import NearestNeighbors


# distance functions from https://github.com/mie-lab/trackintel/blob/master/trackintel/geogr/distances.py

def calculate_distance_matrix(points, dist_metric='haversine', n_jobs=None, *args, **kwds):
    """
    Calculate a distance matrix based on a specific distance metric.
    Parameters
    ----------
    points : GeoDataFrame
        GeoPandas DataFrame in trackintel staypoints format.
    dist_metric : str, {'haversine', 'euclidean'}, default 'haversine'
        The distance metric to be used for caltulating the matrix.
    n_jobs : int, optional
        Number of jobs to be passed to the ``sklearn.metrics`` function ``pairwise_distances``.
    *args
        Description
    **kwds
        Description
    
    Returns
    -------
    array
        An array of size [n_points, n_points].
    """

    try:
        x = points['x'].values
        y = points['y'].values
    except KeyError:
        x = points.geometry.x.values
        y = points.geometry.y.values

    if dist_metric == 'euclidean':
        xy = np.concatenate((x.reshape(-1, 1), y.reshape(-1, 1)), axis=1)
        D = pairwise_distances(xy, n_jobs=n_jobs)


    elif dist_metric == 'haversine':
        # create point pairs to calculate distance from
        n = len(x)

        ix_1, ix_2 = np.triu_indices(n, k=1)
        trilix = np.tril_indices(n, k=-1)

        x1 = x[ix_1]
        y1 = y[ix_1]
        x2 = x[ix_2]
        y2 = y[ix_2]

        d = haversine_dist(x1, y1, x2, y2)

        D = np.zeros((n, n))

        D[(ix_1, ix_2)] = d

        # mirror triangle matrix to be conform with scikit-learn format and to
        # allow for non-symmetric distances in the future
        D[trilix] = D.T[trilix]


    else:
        xy = np.concatenate((x.reshape(-1, 1), y.reshape(-1, 1)), axis=1)
        D = pairwise_distances(xy, metric=dist_metric, n_jobs=n_jobs)

    return D


def haversine_dist(lon_1, lat_1, lon_2, lat_2, r=6371000):
    """Computes the great circle or haversine distance between two coordinates in WGS84.
    # todo: test different input formats, especially different vector

    shapes
    # define output format.
    Parameters
    ----------
    lon_1 : float or numpy.array of shape (-1,)
        The longitude of the first point.

    lat_1 : float or numpy.array of shape (-1,)
        The latitude of the first point.

    lon_2 : float or numpy.array of shape (-1,)
        The longitude of the second point.

    lat_2 : float or numpy.array of shape (-1,)
        The latitude of the second point.
    r     : float
        Radius of the reference sphere for the calculation.
        The average Earth radius is 6'371'000 m.
    Returns
    -------
    float
        An approximation of the distance between two points in WGS84 given in meters.
    Examples
    --------
    >>> haversine_dist(8.5, 47.3, 8.7, 47.2)
    18749.056277719905
    References
    ----------
    https://en.wikipedia.org/wiki/Haversine_formula
    https://stackoverflow.com/questions/19413259/efficient-way-to-calculate-distance-matrix-given-latitude-and-longitude-data-in
    """

    lon_1 = np.asarray(lon_1).ravel() * np.pi / 180
    lat_1 = np.asarray(lat_1).ravel() * np.pi / 180
    lon_2 = np.asarray(lon_2).ravel() * np.pi / 180
    lat_2 = np.asarray(lat_2).ravel() * np.pi / 180

    cos_lat1 = np.cos(lat_1)
    cos_lat2 = np.cos(lat_2)
    cos_lat_d = np.cos(lat_1 - lat_2)
    cos_lon_d = np.cos(lon_1 - lon_2)

    return r * np.arccos(cos_lat_d - cos_lat1 * cos_lat2 * (1 - cos_lon_d))


def transform_data_to_dataframe(data):
    """Extracts ids and coordinates from data structure
    Data structure is defined as in the forest fire json format. Only takes 
    into account a single level and extracts only the following fields: 
            `name`, `lon`, `lat`

    Parameters
    ----------
    data : List of dictionaries. Every entry corresponds to a data point and 
            has at least the following keys:  `name`, `lon`, `lat`

    Returns
    -------
    pandas dataframe with the ids as keys

    """

    X_list = [[row['name'], row['x'], row['y']] for row in data]

    df = pd.DataFrame(data=X_list, columns=['name', 'x', 'y'])

    df.set_index('name', inplace=True)
    df.index = df.index.astype('int')

    return df


def node_distance(G, node_id1, node_id2):
    x1, y1 = G.nodes[node_id1]['pos']
    x2, y2 = G.nodes[node_id2]['pos']
    return sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)


def node_distance_haversine(G, node_id1, node_id2):
    lon1, lat1 = G.nodes[node_id1]['pos']
    lon2, lat2 = G.nodes[node_id2]['pos']
    return haversine_dist(lon1, lat1, lon2, lat2)


def create_graph_representation(data, nbrs_dict, distance_metric):
    """
    Parameters
    ----------
    data : List of dictionaries
         Every entry corresponds to a data point and 
            has at least the following keys:  `name`, `x`, `y`
    nbrs_dict : Dictionary
        Dictionary with the node id as key (=data['name']) and a list of node 
        ids as value. E.g., {'nodeID1': [NodeID1, NodeID2, ...]}
        Can include self-loops. 'name' key corresponds to node ids

    Returns
    -------
    None.
    """

    # create graph and add nodes
    G = nx.Graph()
    for entry in data:
        G.add_node(int(entry['name']), pos=(float(entry['x']), float(entry['y'])))

    # add edges
    for node in G:
        nbrs_list = nbrs_dict[node]
        for nbr in nbrs_list:

            if distance_metric == 'haversine':
                distance = node_distance_haversine(G, node, nbr)
            elif distance_metric == 'euclidean':
                distance = node_distance(G, node, nbr)
            else:
                raise NameError('distance metric wrong')

            G.add_edge(node, nbr, weight=distance)

    return G

def get_graph_from_fire_data(data, k=5, distance_metric='euclidean'):
    """
    Parameters
    ----------
    input_file : list of dictionaries with keys 
    with 
        This is an example on how to create a nn graph form the wildfire
        json file. It will use the simply use the highest level of the data

    Returns
    -------
    NetworkX Graph 

    """

    # get dataframe representation of fire data
    # df has the ID as index and the coordinates as columns
    df = transform_data_to_dataframe(data)

    # create a dictionary of neighbors using a nn calculation
    # dictionary has to allow to look-up node-ids and get a list of node-ids 
    # (that indicate the neighbour nodes)

    # generate neighbourhood graph structure
    nbrs = NearestNeighbors(n_neighbors=k).fit(df[['x', 'y']].values)
    distances, indices = nbrs.kneighbors(df[['x', 'y']].values)

    # translate indices (enumeration) to node ids. This step also deletes 
    # self loops
    ix_array = df.index.values
    indices = [ix_array[row[1:k]] for row in indices]

    nbrs_dict = dict(zip(df.index, indices))

    # get graph
    G = create_graph_representation(data, nbrs_dict, distance_metric=distance_metric)
    return G

class DistanceMatrix():
    def __init__(self, points, distance_metric='euclidean'):
        self.distance_matrix = calculate_distance_matrix(points, dist_metric=distance_metric)
        self.matrix_index_to_node_id = points.reset_index()['name']
        self.node_id_to_matrix_index = pd.Series(self.matrix_index_to_node_id.index.values,
                                                 index=self.matrix_index_to_node_id)
        self.sorted_ranking_cache = {}

    def get_ranking_from_node_id(self, node_id):
        """
        Returns an array of with distance ranks assigned to all other nodes (and the node itself)

        """

        matrix_index = self.node_id_to_matrix_index[node_id]
        distances = self.distance_matrix[:, matrix_index]

        ranks = ss.rankdata(distances)

        self.sorted_ranking_cache = {node_id: ranks}

        return ranks

    def return_node_rank_specific_to_node(self, reference_node, node_to_be_ranked):
        """
        returns the ranking of a node relative to a reference node.

        E.g, the node_to_be_ranked is the 10th closest node to the reference_node
        """

        # get ranking
        if reference_node in self.sorted_ranking_cache:
            ranks = self.sorted_ranking_cache[reference_node]
        else:
            ranks = self.get_ranking_from_node_id(reference_node)

        # get the rank of the node_to_be_ranked
        node_to_be_ranked_matrix_id = self.node_id_to_matrix_index[node_to_be_ranked]
        node_rank = ranks[node_to_be_ranked_matrix_id]

        return node_rank


def get_neighbour_list(G, node):
    return [n for n in G.neighbors(node)]

def get_Uk(G_org, G_proj, node_id):
    Ck = set(get_neighbour_list(G_org, node_id))
    Ck_hat = set(get_neighbour_list(G_proj, node_id))

    Uk = list(Ck_hat - Ck)
    return Uk


def get_Vk(G_org, G_proj, node_id):
    Ck = set(get_neighbour_list(G_org, node_id))
    Ck_hat = set(get_neighbour_list(G_proj, node_id))

    Uk = list(Ck - Ck_hat)
    return Uk


def calculate_M1(G_org, G_proj, d_org, k):
    # Venna, J., & Kaski, S. (2001, August). Neighborhood preservation in 
    # nonlinear projection methods: An experimental study. In International 
    # Conference on Artificial Neural Networks (pp. 485-491). Springer, Berlin,
    # Heidelberg.

    assert len(G_org) == len(G_proj)

    N = np.longlong(len(G_org))
    k = np.longlong(k)

    rank_sum = 0

    norm_factor = 2 / (N * k * (2 * N - 3 * k - 1))

    for xi in G_org.nodes:
        Uk = get_Uk(G_org, G_proj, xi)

        for xj in Uk:
            r = d_org.return_node_rank_specific_to_node(reference_node=xi, node_to_be_ranked=xj)

            rank_sum = rank_sum + (r - k)

    return 1 - (norm_factor * rank_sum)


def calculate_M2(G_org, G_proj, d_proj, k):
    assert len(G_org) == len(G_proj)

    N = np.longlong(len(G_org))
    k = np.longlong(k)
    rank_sum = 0

    norm_factor = 2 / (N * k * (2 * N - 3 * k - 1))

    for xi in G_org.nodes:
        Vk = get_Vk(G_org, G_proj, xi)

        for xj in Vk:
            r = d_proj.return_node_rank_specific_to_node(reference_node=xi, node_to_be_ranked=xj)

            rank_sum = rank_sum + (r - k)

    return 1 - (norm_factor * rank_sum)


def wrapper_for_d_matrix_calculation(data):
    df = transform_data_to_dataframe(data)
    gdf = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df.x, df.y))

    return DistanceMatrix(gdf)


def points_ordering_to_wildfire_structure(points, ordering):
    """Transforms points vector and ordering into the list-of-dicts
    structure resulting from reading the original .json data
    """

    data = [{'name': ix,
             'x': point[0], 'y': point[1]}
            for ix, point in enumerate(points)]

    data_proj = [{'name': ix,
                  'x': order, 'y': 0}
                 for ix, order in enumerate(ordering)]

    return data, data_proj


def calculate_M1_M2_score(data_org, data_proj, d_org, d_proj, k_vec):
    M1 = []
    M2 = []

    for k in k_vec:
        G_org = get_graph_from_fire_data(data_org, k, distance_metric='euclidean')
        G_proj = get_graph_from_fire_data(data_proj, k, distance_metric='euclidean')
        M1.append(calculate_M1(G_org, G_proj, d_org, k))
        M2.append(calculate_M2(G_org, G_proj, d_proj, k))

    return M1, M2


def calculate_metric_stress(dissimilarities_original, dissimilarities_projection, norm=True):
    """
    Calculate metric stress

    The metric stress is normalized to the scale of the projected space. Inputs order can be switched to
    change normalization reference.
    The closer it is to zero, the lower the stress and the better the fit

    Galbraith, J. I., et al. The analysis and interpretation of multivariate data for social scientists. Crc Press, 2002.
    Download link for relevant chapter: http://www.bristol.ac.uk/media-library/sites/cmm/migrated/documents/chapter3.pdf
    """
    N = dissimilarities_original.shape[0]

    # no stress if original and projection "equal" (only one sample)
    if N <= 1:
        return 0

    numerator = 0
    denominator = 0
    for i in range(N):
        for j in range(i):
            numerator = numerator + (dissimilarities_projection[i, j] - dissimilarities_original[i, j]) ** 2
            denominator = denominator + (dissimilarities_projection[i, j]) ** 2
    if norm:
        return sqrt(numerator / denominator)

    else:
        return numerator


def calculate_nonmetric_stress(dissimilarities_original, dissimilarities_projection):
    """
    :param dissimilarities_original: pairwise distance matrix of data in original space
    :param dissimilarities_projection: pairwise distance matrix of data in projected space
    :return:

    Goodhill, Geoffrey J., and Terrence J. Sejnowski.
     "Quantifying neighbourhood preservation in topographic mappings."
     Proceedings of the 3rd Joint Symposium on Neural Computation. Vol. 6. 1996.
    under 4.2 Nonmetric Multidimensional Scaling
    """

    N_org = dissimilarities_original.shape[0]

     # no stress if original and projection "equal" (only one sample)
    if N_org <= 1:
        return 0
    # D_ref_vec = return_upper_tril_vector(D_ref)
    # D_other_vec = return_upper_tril_vector(D_other)

    # create vector of entries based on upper triangle matrix (distance matrix is symmetric, omit diagonal part)
    diss_org_vec = dissimilarities_original[np.triu_indices(N_org, k=1)].ravel()
    diss_proj_vec = dissimilarities_projection[np.triu_indices(N_org, k=1)].ravel()


    iso = IsotonicRegression(increasing=True).fit(diss_org_vec, diss_proj_vec)
    disparities = iso.predict(diss_org_vec)

    # plot_for_to_visualize_non_metric_stress_calculation(diss_org_vec, diss_proj_vec, disparities, iso)

    numerator = np.sum((diss_proj_vec - disparities) ** 2)
    denominator = np.sum(diss_proj_vec ** 2)

    return np.sqrt(numerator/denominator)


def plot_for_to_visualize_non_metric_stress_calculation(diss_org_vec, diss_proj_vec, disparities, iso,
                                                        nb_points=10):
    # plot isotonic regression line
    plt.figure()
    debug_x = np.linspace(min(diss_org_vec), max(diss_org_vec), 1000)
    debug_y = iso.predict(debug_x)
    plt.plot(debug_x, debug_y)

    # get indices to plat a sample of points
    random_indices = np.random.choice(np.arange(diss_org_vec.size), size=nb_points, replace=False)
    random_indices = np.sort(random_indices)

    plt.scatter(diss_org_vec[random_indices], diss_proj_vec[random_indices], label='original')
    plt.scatter(diss_org_vec[random_indices], disparities[random_indices], label='disparities')
    ax = plt.gca()
    for i, txt in enumerate(range(random_indices.size)):
        ax.annotate(txt, (diss_org_vec[random_indices][i], diss_proj_vec[random_indices][i]))

    plt.legend()
    plt.xlabel("original")
    plt.ylabel("projection")
    plt.show()
