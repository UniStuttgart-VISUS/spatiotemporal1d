# Preprocessing

For preprocessing of the data, the datasets need to be present.
For both datasets included here, the resulting data file is compressed using Brotli compression, as are the other generated assets in the project (CSS, JS, HTML).

The preprocessing scripts located in this directory are programmed in Python 3 and require a set of installed dependencies.
The easiest way to ensure these are present is to generate a Python `virtualenv` and install them in that via `pip`.
All dependencies are listed in the file `requirements.txt`.

``` sh
python3 -m venv env
source env/bin/activate
pip install -r requirements.txt
```

## COVID-19 Dataset

The COVID-19 dataset depends on three input files.
The main COVID-19 data from [Covidatlas](https://covidatlas.com/) is the main requirement.
The script `get.sh` in the directory `../data` will download the newest dataset from AWS and deposit it in the `../data` directory.
For the air traffic distance metrices, we also provide a file `../data/country_flow.json`.
In the repository, this file is compressed using Brotli compression and needs to be decompressed first.
Finally, an optional CSV file `../data/location-fix.csv` can be used to fix the geographical locations of places.
Right now, the input data is clean enough, and this is a remnant of times when this was not the case.
If necessary, places can be added again as `Location name,lat,lng` entries.

Within the `virtualenv`, the COVID-19 dataset can be generated as follows:

``` sh
python3 corona.py \
  ../data/timeseries-byLocation.json  \ # input data file from Covidatlas
  ../data/country_flow.json  \          # input data file of air traffic flow
  [ ../data/location-fix.csv ]  \       # CSV to fix geographical locations
  ../dist/corona.json.br                # output file, is Brotli-compressed
```

**NOTE:** As of June 2021, this dataset is no longer updated and the AWS bucket where a last snapshot is hosted ([link](https://liproduction-backupsbucket-1p1muatw3b1h1.s3-us-west-1.amazonaws.com/final-reports-2021-05-29.tgz)) seems to be private.
For the time being, there is no way to get this data, and the version on the live site will therefore only show data up until April 18, 2021, as that was the most recent data I had downloaded.

## RKI COVID-19 Dataset for Germany

The COVID-19 dataset depends on two input files, both provided by the Robert Koch Institute (RKI) under the *data license Germany - attribution - version 2.0* (dl-de/by-2-0).
The script `get.sh` in the directory `../data` will download the newest data from `arcgis.com` and deposit them in the `../data` directory.

Within the `virtualenv`, the RKI COVID-19 dataset can be generated as follows:

``` sh
python3 corona_rki.py \
  ../data/RKI_Corona_Landkreise.geojson \ # county data (GeoJSON)
  ../data/RKI_History.csv  \              # CSV with day-by-day values for the counties
  ../dist/corona_rki.json.br              # output file, is Brotli-compressed
```

## Wildfire Dataset

The wildfire dataset only depends on an input dataset, which is present in the `../data/wildfire-binned.json.br` file in Brotli-compressed form.
Within the `virtualenv`, the Wildfire dataset can be generated as follows:

``` sh
python3 wildfire.py \
  ../data/wildfire-binned.json  \ # input data
  ../dist/wildfire.json.br        # output data, Brotli-compressed
```


# Dataset Format Specification

## Top-level Data Structure

``` json
{
  "timeseries": <timeseries-specification>,
  "visualization": <dataset-specific-instructions>,
  "data": <datum>[],
  "metadata": <metadata>,
  "projections": <projection>[]
}
```


### `<timeseries-specification>`

``` json
{
  "format": <time-format-string>,
  "start": <time-string>,
  "end": <time-string>,
  "series": <time-string>[] | undefined
}
```

Where `<time-format-string>` is a `strftime(3)` formatting string, such as `%Y-%m-%d`.
`start` and `end` specify the bounds of the time series contained in the dataset, and are formatted using the `<time-format-string>` (e.g., `2020-12-31`).

The `series` is optional, and contains an array of all time points that are visualized.
For the religion dataset, this is unused.
For the rest, it serves as a lookup table so the date strings do not have to be repeated in the data itself.


### `<dataset-specific-instructions>`

This is pretty much left to the specific datasets.
It could contain information about color schemes, axis scaling, etc.


### `<datum>`

``` json
{
  "id": <string>,
  "name": <string>,
  "lat": <number>,
  "lng": <number>,
  "data" <timeseries-datum>[] | <generic-time-datum>[],
  "children": <datum>[] | undefined,
  ...
}
```

A datum is one location in the data.
The `id` is unique *for all hierarchy levels.*
For the Corona data, this can be the **ISO 3166** codes.
The `name` is what's shown in the visualization.
`lat` and `lng` are the positions used for the projection method.
`children` is optional and contains the children of the datum in the hierarchy (empty/nonexistent for leaf nodes).
Additional properties can be added to the data as needed for the dataset, such as GeoJSON shapes or metadata.

The `data` property can either be an array of `<timeseries-datum>` nodes, or an array of `<generic-time-datum>`.
The former array must be of the same length as the `series` array in `<timeseries-specification>`, and each position maps to the time point specified at that position in the `series` array.
The latter is more flexible and assumes that each `<datum>` handles all of its own timeseries data.


#### `<timeseries-datum>`

These are also heavily dependent on the specific dataset, but should contain numerical or ordinal data that is then visualized over all time steps.
Ideally, this is just a number or an array of numbers (for multivariate data), where each position encodes one variable, and the positions are specified in the `<dataset-specific-instructions>`.


## `<projection>`

``` json
{
  "name": <string>,
  "total_order": <string>[],
  "per_level": <per-level-orders>[]
}

<per-level-orders> = {
  [parent-id: <string>]: <subtree-level-order>
}

<subtree-level-order> = {
  order: <string>[],
  ...
}
```

For each projection (named `name`), the total order through the hierarchy in pre-order traversal is stored as an array of `id`s in `total_order`.
This is needed mainly by the visualization.

For each level of the hierarchy, there is a `<per-level-orders>` object in the array `per_level`.
The array's 0th position contains level 0, and so on.
The `<per-level-orders>` is an object where the keys are the `id` strings from the `<datum>` objects, specifying the parent ID, and the values are `<subtree-level-order>` objects.
The `parent-id` for the root level is, per definition, `@@ROOT@@`.

The `<subtree-level-order>` contains an array of `id`s, which is the order of that subtree's direct children under the projection.
It also contains projection-specific extra data, such as the quality of the projection for that set of data.

