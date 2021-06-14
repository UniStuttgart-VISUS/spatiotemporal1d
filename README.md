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
For the COVID-19 data, the source dataset needs to be downloaded first, which is handled by the `Makefile`.
Sadly, the *Covidatlas* dataset is not updated or hosted anymore.
We have added a second dataset which only covers the counties (*"Landkreise"*) of Germany and is provided by the RKI.
More detailed instructions regarding dataset preprocessing can be found in `preprocessing/README.md`.
The generated datasets should be placed in the same directory as the generated assets.


### Compression

By default, both the webpage assets and the datasets are compressed using Brotli compression.
This greatly reduces file sizes on transmission, and most modern browsers support Brotli compression for HTTP traffic.
However, the web server needs to support serving files pre-compressed.
If your server does not support this, extract the files before deploy.


## How to Cite

**Note:** This content is bound to change after the EuroVis conference.
At the moment, we do not have all the information (e.g., DOI, page numbers, ...).

Franke et al. "Visual Analysis of Spatio-temporal Phenomena with 1D Projections," to appear in *Proceedings of EuroVis 2021.* The Eurographics Association, 6 2021.

BibTeX entry:
``` bibtex
@inproceedings{franke2021spatiotemporal1d,
  author = { Franke, Max and Martin, Henry and Koch, Steffen and Kurzhals, Kuno },
  title = { Visual Analysis of Spatio-temporal Phenomena with {1D} Projections },
  year = { 2021 },
  month = { 6 },
  doi = { tba },
  pages = { tba },
  booktitle = { To appear in the Proceedings of EuroVis 2021 },
  publisher = { The Eurographics Association },
  abstract = {It is crucial to visually extrapolate the characteristics of their evolution to understand critical spatio-temporal events such as earthquakes, fires, or the spreading of a disease. Animations embedded in the spatial context can be helpful for understanding details, but have proven to be less effective for overview and comparison tasks. We present an interactive approach for the exploration of spatio-temporal data, based on a set of neighborhood-preserving 1D projections which help identify patterns and support the comparison of numerous time steps and multivariate data. An important objective of the proposed approach is the visual description of local neighborhoods in the 1D projection to reveal patterns of similarity and propagation. As this locality cannot generally be guaranteed, we provide a selection of different projection techniques, as well as a hierarchical approach, to support the analysis of different data characteristics. In addition, we offer an interactive exploration technique to reorganize and improve the mapping locally to users’ foci of interest. We demonstrate the usefulness of our approach with different real-world application scenarios and discuss the feedback we received from domain and visualization experts.}
}
```