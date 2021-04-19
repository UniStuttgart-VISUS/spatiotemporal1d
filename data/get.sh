#!/bin/sh

curl --compressed \
  --output corona-raw.json \
  "https://liproduction-reportsbucket-bhk8fnhv1s76.s3-us-west-1.amazonaws.com/v1/latest/timeseries-byLocation.json"
