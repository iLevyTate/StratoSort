const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  const rendererConfig = {
    mode: argv.mode || 'development',
    entry: ['./src/renderer/polyfills.js', './src/renderer/index.js'],
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'renderer.js',
      chunkFilename: '[id].renderer.js',
      publicPath: '',
      globalObject: 'globalThis',
    },
    target: 'electron-renderer',
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-react'],
              plugins: [
                '@babel/plugin-transform-react-jsx',
                ...(process.env.WEBPACK_DEV_SERVER === 'true'
                  ? ['react-refresh/babel']
                  : []),
              ],
            },
          },
        },
        {
          test: /\.css$/,
          use: [
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader',
            'postcss-loader',
          ],
        },
      ],
    },
    resolve: {
      extensions: ['.js', '.jsx'],
      fallback: {
        path: require.resolve('path-browserify'),
        os: require.resolve('os-browserify/browser'),
        crypto: require.resolve('crypto-browserify'),
        buffer: require.resolve('buffer'),
        process: require.resolve('process/browser'),
        stream: require.resolve('stream-browserify'),
        util: require.resolve('util'),
        url: require.resolve('url'),
        querystring: require.resolve('querystring-es3'),
        assert: require.resolve('assert'),
        fs: false,
        child_process: false,
        worker_threads: false,
      },
    },
    externals: {
      electron: 'require("electron")',
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/renderer/index.html',
        filename: 'index.html',
        inject: true,
        scriptLoading: 'blocking',
      }),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(
          isProduction ? 'production' : 'development',
        ),
        global: 'globalThis',
      }),
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      }),
      ...(isProduction
        ? [new MiniCssExtractPlugin({ filename: 'styles.css' })]
        : process.env.WEBPACK_DEV_SERVER === 'true'
          ? [new ReactRefreshWebpackPlugin({ overlay: false })]
          : []),
    ],
    // Use secure devtool options
    devtool: isProduction ? false : 'source-map',

    // Development server configuration
    devServer: isProduction
      ? undefined
      : {
          static: {
            directory: path.join(__dirname, 'dist'),
          },
          compress: true,
          port: 3000,
          hot: true,
          // Security headers
          headers: {
            'Content-Security-Policy':
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' http://localhost:11434 http://127.0.0.1:11434 ws://localhost:*; object-src 'none'; base-uri 'self'; form-action 'self';",
          },
        },

    // Optimization - Enhanced for performance
    optimization: {
      minimize: isProduction,
      moduleIds: 'deterministic',
      chunkIds: 'deterministic',
      concatenateModules: true,
      splitChunks: {
        chunks: 'async', // Focus on async chunks first to avoid conflicts
        minSize: 20000,
        minRemainingSize: 0,
        minChunks: 1,
        maxAsyncRequests: 30,
        maxInitialRequests: 30,
        cacheGroups: {
          // Separate heavy libraries
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'async',
            priority: 10,
            reuseExistingChunk: true,
          },
          // Separate Material-UI (heavy)
          mui: {
            test: /[\\/]node_modules[\\/]@mui[\\/]/,
            name: 'mui-core',
            chunks: 'async',
            priority: 20,
          },
          // Separate PDF processing libraries
          pdfProcessing: {
            test: /[\\/]node_modules[\\/](pdf-parse|mammoth|officeparser|node-tesseract-ocr|sharp)/,
            name: 'pdf-processing',
            chunks: 'async',
            priority: 15,
          },
          defaultVendors: {
            test: /[\\/]node_modules[\\/]/,
            priority: -10,
            reuseExistingChunk: true,
          },
        },
      },
    },
  };

  const mainConfig = {
    mode: argv.mode || 'development',
    entry: './src/main/simple-main.js',
    target: 'electron-main',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'main.js',
    },
    node: {
      __dirname: false,
      __filename: false,
    },
    resolve: {
      extensions: ['.js'],
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(
          isProduction ? 'production' : 'development',
        ),
      }),
    ],
  };

  return [mainConfig, rendererConfig];
};
