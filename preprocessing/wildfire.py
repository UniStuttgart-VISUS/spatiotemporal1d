#!/usr/bin/env python3

import csv
import json
import sys
import argparse
import io
import re
import math
import logging
from datetime import datetime, timedelta
from functools import namedtuple, partial
from itertools import repeat
import brotli
from multiprocessing import Pool

from datatypes import TimeseriesSpecification, \
        Datum, \
        Projection, \
        Dataset

from projections.projection import create_projection
from projections.hilbert import HilbertProjection
from projections.morton import MortonProjection
from projections.hierarchicalclustering import HierarchicalClusteringProjection
from projections.dynamictimewarping import DynamicTimeWarpingProjection
from projections.firstoccurrence import FirstOccurrenceProjection
from projections.umap import UMAPProjection


logging.basicConfig(format='%(asctime)s %(levelname)8s  %(message)s',
        level=logging.INFO,
        datefmt='%H:%M:%S')


tsdateformat = '%Y%m%d%H%M'
outdatetimeformat = '%Y-%m-%d'


def vis_data():
    logging.info('Creating additional visualization data.')

    return dict(fields=['FRP [MW]'])


def load_json(f):
    logging.info('Loading JSON source data from %s', f.name)

    data = json.loads(brotli.decompress(f.read()))

    t0 = datetime.strptime(data['timeseries']['start'], data['timeseries']['format']).date()
    t1 = datetime.strptime(data['timeseries']['end'], data['timeseries']['format']).date()
    dt = timedelta(days=1)

    series = []
    t = t0
    while t <= t1:
        series.append(t)
        t += dt

    timeseries = TimeseriesSpecification(outdatetimeformat, t0, t1, series=series)

    data = list(map(lambda x: create_datum(x, timeseries), data['data']))
    return timeseries, data


def create_datum(datum, timeseries_spec):
    '''
    create a Datum, aggregate measurements by day using the timeseries_spec.
    '''
    if 'children' not in datum \
            or datum['children'] is None \
            or len(datum['children']) == 0:
                children = None
    else:
        children = list(map(lambda x: create_datum(x, timeseries_spec), datum['children']))

    name = datum['name']
    id = name

    # use centroid of areas, instead of northwest corner
    lt, ln = 0,0
    for v in datum['area'].values():
        ln += v[0]
        lt += v[1]

    lat = lt / 4
    lng = ln / 4
    area = datum['area']
    level = datum['level']

    data = aggregate_data_by_day(datum, timeseries_spec.series)

    return Datum(id, name, lat, lng, data, children, area=area, level=level)


def aggregate_data_by_day(datum, timeseries):
    # create dict
    dayfmt = '%Y%m%d'
    data = dict()

    for k, v in datum['data'].items():
        date = datetime.strptime(k, tsdateformat).strftime(dayfmt)
        if date in data:
            data[date] = data[date] + v
        else:
            data[date] = v

    # convert to series
    seriesdata = map(lambda date: data.get(date.strftime(dayfmt), 0), timeseries)
    return list(seriesdata)


def check_no_duplicate_coordinates(agg, root=True):
    if root:
        logging.info('Checking uniqueness of geographical locations.')

    failed = False
    for datum in agg:
        same = list(map(lambda x: x.id, filter(lambda x: x is not datum and abs(x.lat-datum.lat) < 1e-6 and abs(x.lng-datum.lng) < 1e-6, agg)))
        if len(same) > 0:
            failed = True

            logging.error('  Location %s shares the geographical locations of %s.', datum.id, ', '.join(same))

        if datum.children is not None:
            subfail = check_no_duplicate_coordinates(datum.children, False)
            failed = failed or subfail

    return failed


def create_metadata():
    logging.info('Creating dataset metadata.')
    return dict(
        author = [
            "Henry Martin <martinhe@ethz.ch>",
            "Max Franke <Max.Franke@vis.uni-stuttgart.de>",
            ],
        created = datetime.now().strftime('%Y%m%dT%H%M%S'),
        copyright = "TODO",
        description = "Hierarchically aggregated dataset of fire radiative power satellite measurements in Australia"
        )

def extract_timeseries(datum):
    return list(map(lambda x: x if x is not None and not math.isnan(x) else 0, datum.data))

def _do_create(arg):
    data, (p, key, name, description, kwargs) = arg
    proj = create_projection(p, data, key=key, name=name, description=description, k_max=8, k_vec=False, **kwargs)
    logging.info('  Created projection %s.', key)
    return proj


def create_projections(data, flightdata=None, tslen=1):
    logging.info('Creating dataset projections.')

    projections = []

    projections.append((HilbertProjection,
        F'Hilbert',
        F'<span class="main">Hilbert</span>',
        F'''<h4>Hilbert Curve</h4>

        <p>
            The data is ordered along a discrete Hilbert space-filling curve.
        </p>
        ''',
        dict()))

    projections.append((MortonProjection,
        F'Morton',
        F'<span class="main">Morton</span>',
        F'''<h4>Morton Curve</h4>

        <p>
            The data is ordered along a discrete Morton space-filling curve.
        </p>
        ''',
        dict()))

    for method in ('single', 'complete', 'average', 'centroid', 'median', 'ward'):
        key = F'AHC-{method}'
        projections.append((HierarchicalClusteringProjection,
            key,
            F'<span class="main">AHC<sub>{method if method != "ward" else "Ward"}</sub></span>',
            F'''<h4>Agglomerative Hierarchical Clustering with {method.capitalize()} Linkage</h4>

            <p>
                Geospatial distance is used as a distance metric between data points.
                The data is then clustered using agglomerative hierarchical clustering with the {method if method != "ward" else "Ward"} linkage criterion, using the resulting distance matrix.
            </p>
            ''',
            dict(method=method),
            ))

    projections.append((DynamicTimeWarpingProjection,
        F'DTW-single-None',
        F'<span class="main">DTW<sub>single</sub></span>',
        F'''<h4>Dynamic Time Warping with Single Linkage</h4>

        <p>
            Dynamic time warping (DTW) is performed on the time series data without global constraint.
            The data is then clustered using agglomerative hierarchical clustering with the single linkage criterion, using the DTW distance matrix.
        </p>
        ''',
        dict(
            tslen=tslen,
            tsfunc=extract_timeseries,
            method='single',
            global_constraint=None,
        )))

    projections.append((DynamicTimeWarpingProjection,
        F'DTW-single-itakura',
        F'<span class="main">DTW<sub>single, Itakura</sub></span>',
        F'''<h4>Dynamic Time Warping with Single Linkage and Global Itakura Constraint</h4>

        <p>
            Dynamic time warping (DTW) is performed on the time series data with the Itakura parallelogram constraint.
            The data is then clustered using agglomerative hierarchical clustering with the single linkage criterion, using the DTW distance matrix.
        </p>
        ''',
        dict(
            tslen=tslen,
            tsfunc=extract_timeseries,
            method='single',
            global_constraint='itakura',
        )))

    projections.append((DynamicTimeWarpingProjection,
        F'DTW-single-sakoe_chiba',
        F'<span class="main">DTW<sub>single, Sakoe-Chiba</sub></span>',
        F'''<h4>Dynamic Time Warping with Single Linkage and Global Sakoe-Chiba Constraint</h4>

        <p>
            Dynamic time warping (DTW) is performed on the time series data with the Sakoe-Chiba band global constraint<sup>[1]</sup>.
            The data is then clustered using agglomerative hierarchical clustering with the single linkage criterion, using the DTW distance matrix.
        </p>

        <p>
            [1] H. Sakoe, S. Chiba, “Dynamic programming algorithm optimization for spoken word recognition,” IEEE Transactions on Acoustics, Speech and Signal Processing, vol. 26(1), pp. 43–49, 1978.
        </p>
        ''',
        dict(
            tslen=tslen,
            tsfunc=extract_timeseries,
            method='single',
            global_constraint='sakoe_chiba',
        )))

    projections.append((FirstOccurrenceProjection,
        F'first_occurrence',
        F'<span class="main">FO</span>',
        F'''<h4>First Occurrence Ordering</h4>

        <p>
            Order subtrees by the time of the first non-zero value.
        </p>
        ''',
        dict(tslen=tslen, tsfunc=extract_timeseries)
        ))

    projections.append((UMAPProjection,
        F'umap_10_euclidean',
        F'<span class="main">UMAP</span>',
        F'''<h4>1D UMAP</h4>

        <p>
            Order subtrees by their projected position using 1D UMAP.
            <code>n_neighbors</code> = 10, Euclidean distance metric.
        </p>

        <p>
            [1] McInnes, L, Healy, J, <q>UMAP: Uniform Manifold Approximation and Projection for Dimension Reduction,</q> ArXiv e-prints 1802.03426, 2018.
        </p>
        ''',
        dict(n_neighbors=10, metric='euclidean')
        ))



    args = zip(repeat(data), projections)
    projs = Pool().map(_do_create, args)

    return projs


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input', metavar='<input.json.br>', help='Wildfire input data', type=argparse.FileType('rb'))
    parser.add_argument('out', metavar='<output file>', help='Output .json.br filename', type=argparse.FileType('wb'))

    parsed = parser.parse_args(sys.argv[1:])

    timeseries, data = load_json(parsed.input)

    if check_no_duplicate_coordinates(data):
        sys.exit(1)

    projs = create_projections(data, tslen=len(timeseries.series))

    meta = create_metadata()

    dataset = Dataset(
            timeseries=timeseries,
            visualization=vis_data(),
            data=data,
            metadata=meta,
            projections=projs
            )

    logging.info('Compressing final dataset')
    bytesio = io.StringIO()
    dataset.to_json(bytesio)
    json_data = bytesio.getvalue().encode('utf-8')
    sz1 = len(json_data)
    logging.info('  Created JSON (~%.1fMiB)', sz1/1048576)
    compressed = brotli.compress(json_data, brotli.MODE_TEXT)
    sz2 = len(compressed)
    logging.info('  Compressed to ~%.1fMiB (%.1fx)', sz2/1048576, sz1/sz2)

    logging.info('Writing final dataset to %s', parsed.out.name)
    parsed.out.write(compressed)

    logging.info('Done processing Corona dataset')
