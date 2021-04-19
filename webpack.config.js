const path = require('path');
const terser = require('terser-webpack-plugin');
const zlib = require("zlib");
const CompressionPlugin = require("compression-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = function(env, argv) {
  return {
    mode: argv.mode || 'development',
    entry: [
      `./src/entry.ts`,
      `./src/style.scss`,
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
          test: /\.scss$/,
          use: [
            {
              loader: 'file-loader',
              options: {
                name: 'vis.css',
              }
            },
            {
              loader: 'extract-loader'
            },
            {
              loader: 'css-loader'
            },
            {
              loader: 'postcss-loader'
            },
            {
              loader: 'sass-loader'
            }
          ]
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
      new CompressionPlugin({
        filename: '[path][base].br',
        test: /\.js$|\.css$|\.js\.LICENSE\.txt$|\.js\.map$|\.html$/,
        algorithm: 'brotliCompress',
        deleteOriginalAssets: true,
        compressionOptions: {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: (argv.mode === 'production')
              ? zlib.constants.BROTLI_MAX_QUALITY
              : zlib.constants.BROTLI_MIN_QUALITY,
        }
        },
      }),
      new CopyPlugin({
        patterns: [
          {from: 'node_modules/leaflet/dist/leaflet.css', to: '.'},
          {from: 'assets', to: '.'}
        ]
      }),
    ]
  };
}

