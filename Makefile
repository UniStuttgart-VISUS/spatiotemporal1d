all: dist/corona.json.br dist/vis.css.br dist/wildfire.json.br

data/corona-raw.json:
	(cd data; ./get.sh)

dist/corona.json.br: data/corona-raw.json data/country_flow.json data/location-fix.csv
	(source preprocessing/env/bin/activate; preprocessing/corona.py $^ $@)

dist/wildfire.json.br: data/wildfire-binned.json.br
	(source preprocessing/env/bin/activate; preprocessing/wildfire.py $< $@)

dist/vis.css.br: src/style.scss
	sass $< | brotli -Zc > $@

