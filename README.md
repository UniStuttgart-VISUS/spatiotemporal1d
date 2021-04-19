# Visual Analysis of Spatio-temporal Phenomena with 1D Projections

A live version of the prototype is available [here](http://566a2c3d-1608-4879-9865-345003f9aabf.ma.bw-cloud-instance.org).

## Building the Project
### JavaScript, CSS, HTML

All webpage assets are generated using *WebPack,* and dependencies are collected using the *NPM* package manager, which must be present prior to compilation.
The generated assets are placed in the `dist/` folder by default:
``` sh
$ npm i
$ # "webpack --mode production" for better compression and minified assets
$ webpack
```


### Generating the Datasets

The datasets for COVID-19 cases and Australian wildfires can be generated using the Python scripts in the `preprocessing` directory.
For the COVID-19 data, the source dataset needs to be downloaded first.
More detailed instructions regarding dataset preprocessing can be found in `preprocessing/README.md`.
The generated datasets should be placed in the same directory as the generated assets.


### Compression

By default, both the webpage assets and the datasets are compressed using Brotli compression.
This greatly reduces file sizes on transmission, and most modern browsers support Brotli compression for HTTP traffic.
However, the web server needs to support serving files pre-compressed.
If your server does not support this, extract the files before deploy.


## How to Cite

**TODO:** Citable

BibTeX entry:
``` bibtex
@inproceedings{TODO,
  author = { Franke, Max and Martin, Henry and Koch, Steffen and Kurzhals, Kuno },
  title = { Visual Analysis of Spatio-temporal Phenomena with 1D Projections },
  year = { 2021 },
  month = { 6 },
  doi = { TODO },
  pages = { TODO },
  booktitle = { Proc.\ EuroVis },
  publisher = { The Eurographics Association },
  ...
}
```
