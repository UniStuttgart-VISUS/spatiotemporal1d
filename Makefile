all: dist/corona.json.br dist/vis.css.br dist/wildfire.json.br corona_rki.json.br

data/corona-raw.json data/RKI_Corona_Landkreise.geojson data/RKI_History.csv:
	(cd data; ./get.sh)

# does not work anymore
dist/corona.json.br: data/corona-raw.json data/country_flow.json data/location-fix.csv
	(source preprocessing/env/bin/activate; preprocessing/corona.py $^ $@)

dist/corona_rki.json.br: data/RKI_Corona_Landkreise.geojson data/RKI_History.csv
	(source preprocessing/env/bin/activate; preprocessing/corona_rki.py $^ $@)

dist/wildfire.json.br: data/wildfire-binned.json.br
	(source preprocessing/env/bin/activate; preprocessing/wildfire.py $< $@)

dist/vis.css.br: src/style.scss
	sass $< | brotli -Zc > $@

