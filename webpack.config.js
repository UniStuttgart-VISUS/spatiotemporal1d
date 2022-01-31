const path = require('path');
const terser = require('terser-webpack-plugin');
const CopyPlugin = require("copy-webpack-plugin");

module.exports = function(env, argv) {
  return {
    mode: argv.mode || 'development',
    entry: [
      `./src/entry.ts`,
      `./html/index.html`,
      `./html/vis.html`,
    ],
    devtool: (argv.mode === 'production') ? false : 'eval-cheap-source-map',
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
        },
        {
          test: /\.template\.html$/,
          use: [
            {
              loader: 'extract-loader'
            },
            {
              loader: 'html-loader',
              options: {
                minimize: true,
              },
            },
          ],
        },
        {
          test: /\.html$/,
          exclude: /\.template\.html$/,
          use: [
            {
              loader: 'file-loader?name=[name].[ext]',
            },
            {
              loader: 'extract-loader'
            },
            {
              loader: 'html-loader',
              options: {
                minimize: true,
                attributes: false,
              },
            },
          ],
        },
      ]
    },
    resolve: {
      extensions: [ '.ts', '.js' ]
    },
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, `dist/`),
      library: 'SFC'
    },
    optimization: {
      //minimize: argv.optimizeMinimize,
      minimizer: [ new terser({
        terserOptions: {
          compress: {
            drop_console: true
          }
        }
      }) ]
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          {from: 'node_modules/leaflet/dist/leaflet.css', to: '.'},
          {from: 'assets', to: '.'}
        ]
      }),
    ]
  };
}

