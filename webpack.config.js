const path = require('path');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  // Base configuration for renderer
  const rendererConfig = {
    mode: argv.mode || 'development',
    entry: './src/renderer/App.jsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'renderer.js',
      clean: false // Don't clean when building multiple targets
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
              plugins: ['@babel/plugin-transform-react-jsx']
            }
          }
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader', 'postcss-loader']
        }
      ]
    },
    resolve: {
      extensions: ['.js', '.jsx'],
      alias: {
        '@': path.resolve(__dirname, 'src/renderer')
      },
      fallback: {
        'path': require.resolve('path-browserify'),
        'os': require.resolve('os-browserify/browser'),
        'crypto': require.resolve('crypto-browserify'),
        'buffer': require.resolve('buffer'),
        'process': require.resolve('process/browser'),
        'stream': require.resolve('stream-browserify'),
        'util': require.resolve('util'),
        'url': require.resolve('url'),
        'querystring': require.resolve('querystring-es3'),
        'assert': require.resolve('assert'),
        'fs': false,
        'child_process': false,
        'worker_threads': false
      }
    },
    externals: {
      electron: 'require("electron")'
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/renderer/index.html',
        filename: 'index.html',
        inject: true
      }),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
        'global': 'globalThis'
      }),
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
        React: 'react',
        ReactDOM: 'react-dom'
      })
    ],
    devtool: isProduction ? false : 'source-map',
    devServer: isProduction ? undefined : {
      static: {
        directory: path.join(__dirname, 'dist')
      },
      compress: true,
      port: 3000,
      hot: true,
      headers: {
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' http://localhost:11434 ws://localhost:*; object-src 'none'; base-uri 'self'; form-action 'self';"
      }
    },
    optimization: {
      minimize: isProduction,
      splitChunks: false
    }
  };

  // If we're building for production, also build main and preload
  if (isProduction) {
    return [
      rendererConfig,
      // Main process config
      {
        mode: 'production',
        entry: './src/main/index.js',
        target: 'electron-main',
        output: {
          path: path.resolve(__dirname, 'dist/main'),
          filename: 'index.js'
        },
        node: {
          __dirname: false,
          __filename: false
        },
        externals: {
          electron: 'require("electron")'
        }
      },
      // Preload process config
      {
        mode: 'production',
        entry: './src/preload/index.js',
        target: 'electron-preload',
        output: {
          path: path.resolve(__dirname, 'dist/preload'),
          filename: 'index.js'
        },
        node: {
          __dirname: false,
          __filename: false
        },
        externals: {
          electron: 'require("electron")'
        }
      }
    ];
  }

  return rendererConfig;
}; 