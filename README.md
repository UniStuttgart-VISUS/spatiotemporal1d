[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.11234747.svg)](https://doi.org/10.5281/zenodo.11234747)

# Visual Analysis of Spatio-temporal Phenomena with 1D Projections

A live version of the prototype is available [here](http://566a2c3d-1608-4879-9865-345003f9aabf.ma.bw-cloud-instance.org)[^1].
A dump of the static files can be found [here](https://zenodo.org/doi/10.5281/zenodo.11234746).
A Docker image for the dataset preprocessing can be found [here](#todo).

[^1]: The live version will probably cease to exist as of July 2024.

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
For the COVID-19 data, the source dataset needs to be downloaded first, which is handled by the `Makefile`.
Sadly, the *Covidatlas* dataset is not updated or hosted anymore.
We have added a second dataset which only covers the counties (*"Landkreise"*) of Germany and is provided by the RKI.
More detailed instructions regarding dataset preprocessing can be found in `preprocessing/README.md`.
The generated datasets should be placed in the same directory as the generated assets.


### Compression

By default, both the datasets are compressed using Brotli compression.
This greatly reduces file sizes on transmission, and most modern browsers support Brotli compression for HTTP traffic.
However, the web server needs to support serving files pre-compressed.
If your server does not support this, extract the files before deploy.


## How to Cite

Franke M., Martin H., Koch S., Kurzhals K.: Visual Analysis of Spatio-temporal Phenomena with 1D Projections. *Computer Graphics Forum 40,* 3 (6 2021), 335–347. [doi:10.1111/cgf.14311](https://doi.org/10.1111/cgf.14311).

BibTeX entry:
``` bibtex
@article{10.1111:cgf.14311,
  title = {Visual Analysis of Spatio-temporal Phenomena with {1D} Projections},
  author = {Franke, Max and Martin, Henry and Koch, Steffen and Kurzhals, Kuno},
  year = {2021},
  month = {6},
  journal = {Computer Graphics Forum},
  volume = {40},
  number = {3},
  pages = {335--347},
  publisher = {The Eurographics Association and John Wiley \& Sons Ltd.},
  ISSN = {1467-8659},
  DOI = {10.1111/cgf.14311},
  abstract = {It is crucial to visually extrapolate the characteristics of their evolution to understand critical spatio-temporal events such as earthquakes, fires, or the spreading of a disease. Animations embedded in the spatial context can be helpful for understanding details, but have proven to be less effective for overview and comparison tasks. We present an interactive approach for the exploration of spatio-temporal data, based on a set of neighborhood-preserving 1D projections which help identify patterns and support the comparison of numerous time steps and multivariate data. An important objective of the proposed approach is the visual description of local neighborhoods in the 1D projection to reveal patterns of similarity and propagation. As this locality cannot generally be guaranteed, we provide a selection of different projection techniques, as well as a hierarchical approach, to support the analysis of different data characteristics. In addition, we offer an interactive exploration technique to reorganize and improve the mapping locally to users’ foci of interest. We demonstrate the usefulness of our approach with different real-world application scenarios and discuss the feedback we received from domain and visualization experts.}
}
```
