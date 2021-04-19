import json
import sys
import os

# include parent dir
sys.path.insert(1, os.path.join(sys.path[0], '..'))

import matplotlib.pyplot as plt
import numpy as np
from projections.projection import Projection
from projections.qualitymetrics import wrapper_for_d_matrix_calculation, get_graph_from_fire_data, \
    points_ordering_to_wildfire_structure, calculate_M1_M2_score, calculate_M1, calculate_M2, \
    calculate_metric_stress, calculate_nonmetric_stress
from sklearn import manifold
from sklearn.manifold import MDS
from sklearn.metrics import euclidean_distances


def test_using_wildfire_data():
    input_file = os.path.join('../..', 'data', 'wildfire-binned.json')  # assumes cwd = preprocessing/tests
    print(os.getcwd())
    with open(input_file) as json_file:
        data_raw = json.load(json_file)
        data_raw = data_raw['data']

    # create projected data sets where lon=lat
    data = [{'name': data_row['name'],
             'x': data_row['lon'], 'y': data_row['lat']}
            for data_row in data_raw]
    data_proj_0 = [{'name': data_row['name'],
                    'x': data_row['lon'], 'y': 0}
                   for data_row in data_raw]
    data_proj_rand1 = [{'name': data_row['name'],
                        'x': data_row['lon'], 'y': np.random.random() * -45 + 5}
                       for data_row in data_raw]
    data_proj_rand2 = [{'name': data_row['name'],
                        'x': np.random.random() * -45 + 5, 'y': np.random.random() * -45 + 5}
                       for data_row in data_raw]

    # calculate distance matrix for rank caluclation
    d_org = wrapper_for_d_matrix_calculation(data)
    d_proj_0 = wrapper_for_d_matrix_calculation(data_proj_0)
    d_proj_rand1 = wrapper_for_d_matrix_calculation(data_proj_rand1)
    d_proj_rand2 = wrapper_for_d_matrix_calculation(data_proj_rand2)

    M1_none = []
    M1_0 = []
    M1_rand1 = []
    M1_rand2 = []
    M2_none = []
    M2_0 = []
    M2_rand1 = []
    M2_rand2 = []

    k_vec = np.arange(1, 21, 5)
    for k in k_vec:
        G_org = get_graph_from_fire_data(data, k, distance_metric='haversine')
        G_proj_0 = get_graph_from_fire_data(data_proj_0, k, distance_metric='haversine')
        G_proj_rand1 = get_graph_from_fire_data(data_proj_rand1, k, distance_metric='haversine')
        G_proj_rand2 = get_graph_from_fire_data(data_proj_rand2, k, distance_metric='haversine')

        # # plot overview
        # plt.figure()
        # nx.draw(G_org, nx.get_node_attributes(G_org, 'pos'))
        # plt.figure()
        # nx.draw(G_proj_0, nx.get_node_attributes(G_proj_0, 'pos'))
        # plt.figure()
        # nx.draw(G_proj_rand1, nx.get_node_attributes(G_proj_rand1, 'pos'))
        # plt.figure()
        # nx.draw(G_proj_rand, nx.get_node_attributes(G_proj_rand, 'pos'))

        M1_0.append(calculate_M1(G_org, G_proj_0, d_org, k))
        M2_0.append(calculate_M2(G_org, G_proj_0, d_proj_0, k))

        M1_rand1.append(calculate_M1(G_org, G_proj_rand1, d_org, k))
        M2_rand1.append(calculate_M2(G_org, G_proj_rand1, d_proj_rand1, k))

        M1_rand2.append(calculate_M1(G_org, G_proj_rand2, d_org, k))
        M2_rand2.append(calculate_M2(G_org, G_proj_rand2, d_proj_rand2, k))

    plt.figure()
    plt.plot(k_vec, M1_0, label='proj0', linestyle=':')
    plt.plot(k_vec, M1_rand1, label='rand1', linestyle='--')
    plt.plot(k_vec, M1_rand2, label='rand2')
    plt.title('Trustworthiness of the neighbourhoods')
    plt.xlabel('k')
    plt.ylabel('M1')
    plt.legend()
    plt.savefig('wildfire_test_dummy_projection_M1.png')

    plt.figure()
    plt.plot(k_vec, M2_0, label='proj0', linestyle=':')
    plt.plot(k_vec, M2_rand1, label='rand1', linestyle='--')
    plt.plot(k_vec, M2_rand2, label='rand2')
    plt.title('Preservation of the original neighbourhoods')
    plt.xlabel('k')
    plt.ylabel('M2')
    plt.legend()
    plt.savefig('wildfire_test_dummy_projection_M2.png')

    assert True


def test_using_vectors():
    proj = Projection()
    x_arr, y_arr = np.meshgrid(np.arange(6), np.arange(6))
    points = np.concatenate((x_arr.reshape(-1, 1), y_arr.reshape(-1, 1)), axis=1)
    ordering = x_arr.reshape(-1, 1)


    data, data_proj = points_ordering_to_wildfire_structure(points, ordering)
    # calculate distance matrix for rank caluclation
    d_org = wrapper_for_d_matrix_calculation(data)
    d_proj = wrapper_for_d_matrix_calculation(data_proj)
    k_max = 10
    k_vec = np.arange(1, min(len(points / 2), 10))
    M1, M2 = calculate_M1_M2_score(data, data_proj, d_org, d_proj, k_vec)

    metric_stress = calculate_metric_stress(d_org.distance_matrix/np.max(d_org.distance_matrix),
                                            d_proj.distance_matrix/np.max(d_proj.distance_matrix))
    nonmetric_stress = calculate_nonmetric_stress(d_org.distance_matrix, d_proj.distance_matrix)

    output_dict = proj._calculate_quality_metrics(points, ordering, k_max, True)

    assert np.mean(M1) == output_dict['M1']
    assert np.mean(M1) == output_dict['M1']
    assert metric_stress == output_dict['metric_stress']
    assert nonmetric_stress == output_dict['nonmetric_stress']

    plt.figure()
    plt.plot(k_vec, M1, label='proj0', linestyle=':')
    plt.title('Trustworthiness of the neighbourhoods\n stress = {:.2}'.format(metric_stress))
    plt.xlabel('k')
    plt.ylabel('M1')
    plt.legend()
    plt.savefig('vector_test_dummy_projection_M1.png')

    plt.figure()
    plt.plot(k_vec, M2, label='proj0', linestyle=':')
    plt.title('Preservation of the original neighbourhoods\n stress = {:.2}'.format(metric_stress))
    plt.xlabel('k')
    plt.ylabel('M2')
    plt.legend()
    plt.savefig('vector_test_dummy_projection_M2.png')


def test_stress():
    proj = Projection()
    x_arr, y_arr = np.meshgrid(np.arange(4), np.arange(4))
    points = np.concatenate((x_arr.reshape(-1, 1), y_arr.reshape(-1, 1)), axis=1)
    ordering = x_arr.reshape(-1, 1)

    points = points[:8]
    ordering = ordering[:8]

    data, data_proj = points_ordering_to_wildfire_structure(points, ordering)
    # calculate distance matrix for rank caluclation
    d_org = wrapper_for_d_matrix_calculation(data)
    d_proj = wrapper_for_d_matrix_calculation(data_proj)
    k_vec = [1, 2, 3]  # np.arange(1, 5, 1)
    metric_stress = calculate_metric_stress(d_org.distance_matrix, d_proj.distance_matrix)
    inv_metric_stress = calculate_metric_stress(d_proj.distance_matrix, d_org.distance_matrix)


def test_stress2():
    # copy example from https://scikit-learn.org/stable/auto_examples/manifold/plot_mds.html#sphx-glr-auto-examples-manifold-plot-mds-py

    EPSILON = np.finfo(np.float32).eps
    n_samples = 20
    seed = np.random.RandomState(seed=3)
    X_true = seed.randint(1, 20, 2 * n_samples).astype(np.float)
    X_true = X_true.reshape((n_samples, 2))
    # Center the data
    X_true -= X_true.mean()

    similarities = euclidean_distances(X_true)

    # Add noise to the similarities
    noise = np.random.rand(n_samples, n_samples)
    noise = noise + noise.T
    noise[np.arange(noise.shape[0]), np.arange(noise.shape[0])] = 0
    similarities += noise

    mds_metric = manifold.MDS(n_components=1, max_iter=3000, eps=1e-9, random_state=seed,
                              dissimilarity="precomputed", n_jobs=1, metric=True)

    pos_metric = mds_metric.fit(similarities).embedding_

    similarities_proj_metric = euclidean_distances(pos_metric)

    metric_stress = calculate_metric_stress(similarities, similarities_proj_metric, norm=False)
    metric_stress_norm = calculate_metric_stress(similarities_proj_metric, similarities, norm=True)

    assert np.isclose(metric_stress, mds_metric.stress_)
    assert metric_stress_norm < 1


def test_nonmetric_stress_runthrough():
    proj = Projection()
    n = 10
    x_arr, y_arr = np.meshgrid(np.arange(10), np.arange(10))

    points = np.concatenate((x_arr.reshape(-1, 1), y_arr.reshape(-1, 1)), axis=1)
    points = np.concatenate((points, points * 10000))

    ordering = range(points.shape[0])

    data, data_proj = points_ordering_to_wildfire_structure(points, ordering)

    d_org = wrapper_for_d_matrix_calculation(data)
    d_proj = wrapper_for_d_matrix_calculation(data_proj)

    nonmetric_stress = calculate_nonmetric_stress(d_org.distance_matrix, d_proj.distance_matrix)

    assert nonmetric_stress < 1


def test_compare_non_metric_to_scikit():
    X = np.random.rand(100, 1000) + 1

    stress_nonmetric = []
    my_nonmetric_stress = []
    stress_nonmetric_unscaled = []
    n_components_vec = np.arange(2, 60, 5)

    for n_components in n_components_vec:
        clf = MDS(n_components=n_components, metric=False, max_iter=5000)
        X_mds = clf.fit_transform(X)
        stress_nonmetric_unscaled.append(np.sqrt(clf.stress_))
        # normalize stress returned by scikit
        # the norm-factor corresponds to our denominator
        D_proj = euclidean_distances(X_mds)
        norm_factor = np.sum(D_proj[np.triu_indices(D_proj.shape[0], k=1)].ravel() ** 2)
        stress_nonmetric.append(np.sqrt(clf.stress_ / norm_factor))

        my_nonmetric_stress.append(calculate_nonmetric_stress(euclidean_distances(X),
                                                              euclidean_distances(X_mds)))

    # visual inspection
    plt.figure()
    plt.plot(n_components_vec, my_nonmetric_stress, label='my non-metric stress')
    plt.plot(n_components_vec, stress_nonmetric,
             label='manually normalized scikit non-metric stress')
    plt.xlabel('target dimension')
    plt.ylabel('non metric stress')

    plt.legend()
    plt.figure()
    plt.plot(stress_nonmetric_unscaled, my_nonmetric_stress)
    plt.title('sqrt of original scikit non-metric stress vs my stress')
    plt.xlabel('sqrt scikit non-metric stress')
    plt.ylabel('my nonmetric stress')
    # there is an additional normalization factor in the scikit implementation of nonmetric MDS which I can not
    # account for.
    # disparities *= np.sqrt((n_samples * (n_samples - 1) / 2) (disparities ** 2).sum()) # from
    # https://github.com/scikit-learn/scikit-learn/blob/0fb307bf3/sklearn/manifold/_mds.py#L106

    plt.show()
    assert True

if __name__ == '__main__':
    test_using_wildfire_data()
    test_using_vectors()
    test_stress()
    test_stress2()
    test_nonmetric_stress_runthrough()
    test_compare_non_metric_to_scikit()
