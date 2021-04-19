import CVis from './corona-vis';
import WVis from './wildfire-vis';

import {select} from 'd3-selection';

const url = new URL(window.location.href);
const params = new URLSearchParams(url.search);

const matches
  : [RegExp, typeof CVis | typeof WVis /*| typeof RVis*/, string][]
  = [
  [/^corona$/i, CVis, 'corona.json'],
  [/^wildfire$/i, WVis, 'wildfire.json'],
];

function launch(vis: string | null) {
  for (let [re, cls, url] of matches) {
    if (re.test(vis)) {
      return new cls(url);
    }
  }

  // no return
  console.error(`Unknown or unspecified visualization: ${vis}`);
  select('body').selectAll('*').remove();
  select('body').append('h2')
    .text('Error');
  select('body').append('p')
    .text('Something went wrong.');
}

launch(params.get('vis'));
