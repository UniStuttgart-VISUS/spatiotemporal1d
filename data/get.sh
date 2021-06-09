#!/bin/sh

# sadly does not exist anymore
#curl --compressed \
#  --output corona-raw.json \
#  "https://liproduction-reportsbucket-bhk8fnhv1s76.s3-us-west-1.amazonaws.com/v1/latest/timeseries-byLocation.json"

curl --compressed --fail \
  --output RKI_Corona_Landkreise.geojson \
  "https://opendata.arcgis.com/api/v3/datasets/917fc37a709542548cc3be077a786c17_0/downloads/data?format=geojson&spatialRefId=4326"

curl --compressed --fail \
  --output RKI_History.csv \
  "https://opendata.arcgis.com/api/v3/datasets/6d78eb3b86ad4466a8e264aa2e32a2e4_0/downloads/data?format=csv&spatialRefId=4326"

