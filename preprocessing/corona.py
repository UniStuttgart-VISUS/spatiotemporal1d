#!/usr/bin/env python3

import csv
import json
import sys
import argparse
import io
import re
import math
import logging
from datetime import datetime
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
from projections.hierarchicalclustering import HierarchicalClusteringProjection, HierarchicalClusteringFlightdataProjection
from projections.dynamictimewarping import DynamicTimeWarpingProjection
from projections.firstoccurrence import FirstOccurrenceProjection


logging.basicConfig(format='%(asctime)s %(levelname)8s  %(message)s',
        level=logging.INFO,
        datefmt='%H:%M:%S')


tsdateformat = '%Y-%m-%d'
outdatetimeformat = tsdateformat


def vis_data():
    logging.info('Creating additional visualization data.')

    return dict(fields=['cases', 'cases_normalized', 'active', 'active_normalized'])


def aggregate(lst, lut):
    Name = namedtuple('Name', ['name'])
    by_name = { x.name: x for x in lst }
    for k,v in lut.items():
        if v is None:
            continue
        if v not in by_name:
            by_name[v] = Name(v)

    for k, v in by_name.items():
        c = list(filter(lambda d: lut[d.name] == k, by_name.values()))
        if c is not None and len(c) > 0:
            v.children = c

    top_level = list(filter(lambda d: lut[d.name] is None, by_name.values()))

    return top_level

def parent(seq):
    seq = list(filter(lambda s: len(s)>0, seq))
    s1 = ', '.join(seq)
    s2 = None if len(seq) == 1 else ', '.join(seq[1:])
    return s1,s2

def load_json(f):
    logging.info('Loading JSON source data from %s', f.name)

    hierarchy = dict()
    data = json.load(f)

    timeseries = set()
    for place in data:
        for date in place['dates'].keys():
            d = datetime.strptime(date, tsdateformat)
            timeseries.add(d.strftime(outdatetimeformat))
    timeseries = list(timeseries)
    timeseries.sort()

    logging.info('  Loaded %s timestamps, %s - %s.', len(timeseries), timeseries[0], timeseries[-1])

    locdata = []

    for location in data:
        placeinformation = [
            location.get('countyName', ''),
            location.get('stateName', ''),
            location.get('countryName', ''),
                ]
        ch,p = parent(placeinformation)
        hierarchy[ch] = p

        if 'coordinates' in location:
            lng, lat = tuple(location.get('coordinates'))
        else:
            lat, lng = None, None

        # cases, deaths, tested, growthFactor, recovered, active
        ldata = parse_location_data(timeseries, location, location['dates'])

        locdata.append(Datum(
            name=ch,
            id=location.get('locationID'),
            lat=lat,
            lng=lng,
            data=ldata
            ))

    logging.info('  Loaded %s intermediate locations.', len(locdata))

    timeseries_spec = TimeseriesSpecification(
            fmt=outdatetimeformat,
            start=datetime.strptime(timeseries[0], outdatetimeformat),
            end=datetime.strptime(timeseries[-1], outdatetimeformat),
            series=list(map(lambda x: datetime.strptime(x, outdatetimeformat), timeseries))
            )

    return timeseries_spec, locdata, hierarchy


def load_flightdata(f):
    logging.info('Loading flight data from %s', f.name)
    keyfmt = re.compile(R'\(\'(.*)\', \'(.*)\'\)')
    j = json.load(f)
    countries = set()
    for k in j:
        m = keyfmt.fullmatch(k)
        assert m, k
        countries.add(m[1])
        countries.add(m[2])

    size = len(countries)
    lut = { country: idx for idx, country in enumerate(countries) }
    matrix = [None] * (size * size)

    cl = list(countries)
    for i, c1 in enumerate(cl):
        for c2 in cl[i+1:]:
            k1 = F"('{c1}', '{c2}')"
            k2 = F"('{c2}', '{c1}')"

            d1 = j.get(k1, 0)
            d2 = j.get(k2, 0)

            i1 = lut[c1]
            i2 = lut[c2]

            j1 = i1 + size * i2
            j2 = i2 + size * i1

            matrix[j1] = d1 + d2
            matrix[j2] = d1 + d2

    # upper-case name codes in lookup table
    pattern = re.compile('iso1:([A-Za-z]+)')
    lut_new = dict()
    for k,v in lut.items():
        m = pattern.fullmatch(k)
        assert m, k
        lut_new[F'iso1:{m[1].lower()}'] = v

    return dict(size=size, indices=lut_new, matrix=matrix)


def parse_location_data(ts, loc, data):
    simplified_data = []
    for t in ts:
        if t not in data:
            logging.debug(F'  Date {t} not in datum for location {loc["locationID"]}')
        datum = data.get(t, dict())
        try:
            if 'cases' in datum:
                if type(datum['cases']) == str:
                    datum['cases'] = int(datum['cases'])
                datum['cases_normalized'] = datum['cases'] / loc['population'] * 1000000

            if 'active' in datum:
                if type(datum['active']) == str:
                    datum['active'] = int(datum['active'])
                datum['active_normalized'] = datum['active'] / loc['population'] * 1000000

            else:
                if 'cases' in datum and 'recovered' in datum and 'deaths' in datum:
                    datum['active'] = int(datum['cases']) - int(datum['recovered']) - int(datum['deaths'])
                    datum['active_normalized'] = datum['active'] / loc['population'] * 1000000
                else:
                    datum['active'] = None
                    datum['active_normalized'] = None


            simplified_data.append([
                datum.get('cases', None),
                datum.get('cases_normalized', None),
                datum.get('active', None),
                datum.get('active_normalized', None),
                ])

        except TypeError as err:
            print(err, datum)
            raise err

    return simplified_data


def fix_missing(data, lut, missing):
    logging.info('Fixing missing hierarchy parents.')
    for m in missing:
        import uuid

        i = m.find(', ')
        parent = m[i+2:]

        children = list(filter(lambda d: lut[d['name']] == m, data))

        conf = dict()

        for child in children:
            for k,v in child['data'].items():
                if k in conf:
                    conf[k] = conf[k] + v
                else:
                    conf[k] = v
        data_ = conf

        lts = list(filter(lambda d: d is not None, map(lambda d: d['lat'], children)))
        lns = list(filter(lambda d: d is not None, map(lambda d: d['lng'], children)))
        lat = None if len(lts) == 0 else sum(lts) / len(lts)
        lng = None if len(lns) == 0 else sum(lns) / len(lns)

        elem = Datum(name=m, data=data_, lat=lat, lng=lng, id=str(uuid.uuid1()))
        data.append(elem)
        lut[m] = parent

        logging.info('  Adding hierarchy node for %s', m)


def fix_lat_lng(data, f):
    logging.info('Fixing coordinates.')
    fixes = dict()
    failed = False

    c = csv.reader(f)
    for line in c:
        lat = float(line[1])
        lng = float(line[2])
        fixes[line[0]] = (lat, lng)

    for d in data:
        if (d.lat is None or d.lng is None) and d.name not in fixes:
            logging.error('  Location %s has no valid coordinates!', d.name)
            failed = True

        if d.name in fixes:
            lat, lng = fixes[d.name]
            logging.info(F'  Fixing lat/lng for {d.name}: {d.lat}/{d.lng} -> {lat}/{lng}')
            d.lat = lat
            d.lng = lng

    return failed


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
        author = "Max Franke <Max.Franke@vis.uni-stuttgart.de>",
        created = datetime.now().strftime('%Y%m%dT%H%M%S'),
        copyright = "Data from the open domain, retrieved from https://coronadatascraper.com",
        description = "Hierarchically aggregated dataset of confirmed COVID-19 cases each day, on country, state, county level."
        )


def extract_timeseries(datum):
    return list(map(lambda x: x if x is not None and not math.isnan(x) else 0, [ d[1] for d in datum.data ]))


def _do_create(arg):
    data, (p, key, name, description, kwargs) = arg
    proj = create_projection(p, data, key=key, name=name, description=description, k_max=5, k_vec=False, **kwargs)
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

    for method in ('single', 'complete', 'average', 'centroid', 'median'):
        key = F'flow-{method}'
        projections.append((HierarchicalClusteringFlightdataProjection,
            key,
            F'<span class="main">AIRTRAFFIC<sub>{method}</sub></span>',
            F'''<h4>Air Traffic Clustering with {method.capitalize()} Linkage</h4>

            <p>
                Air traffic passenger numbers are used as an inverse distance measure on country level.
                On lower hierarchy levels, geospatial distance is used instead.
                The data is then clustered using agglomerative hierarchical clustering with the {method} linkage criterion, using the resulting distance matrix.
            </p>
            ''',
            dict(flightdata=flightdata, method=method)
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

    args = zip(repeat(data), projections)

    projs = Pool().map(_do_create, args)

    return projs


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('corona', metavar='<corona json>', help='Corona input data', type=argparse.FileType('r', encoding='UTF-8'))
    parser.add_argument('flights', metavar='<flight json>', help='Flight input data', type=argparse.FileType('r', encoding='UTF-8'))
    parser.add_argument('locations', metavar='<location fix csv>', help='Location input data', type=argparse.FileType('r', encoding='UTF-8'), nargs='?')
    parser.add_argument('out', metavar='<output file>', help='Output JSON filename', type=argparse.FileType('wb'))

    parsed = parser.parse_args(sys.argv[1:])

    timeseries, locdata, lut = load_json(parsed.corona)
    flightdata = load_flightdata(parsed.flights)

    missing = set()
    for k, v in lut.items():
        if v not in lut and v is not None:
            missing.add(v)


    missing_fail = False
    if len(missing) > 0:
        missing_fail = fix_missing(locdata, lut, missing)

    fix_lat_lng(locdata, parsed.locations)

    agg = aggregate(locdata, lut)
    coord_fail = check_no_duplicate_coordinates(agg)

    if missing_fail or coord_fail:
        sys.exit(1)

    projs = create_projections(agg, flightdata=flightdata, tslen=len(timeseries.series))

    meta = create_metadata()

    dataset = Dataset(
            timeseries=timeseries,
            visualization=vis_data(),
            data=agg,
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
