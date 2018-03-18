const {execSync} = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const winston = require('winston-color');
const webpack = require('webpack');

const NativeScriptVueExternals = require('nativescript-vue-externals');
const NativeScriptVueTarget = require('nativescript-vue-target');

const CopyWebpackPlugin = require('copy-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const ExecTnsPlugin = require('exec-tns-webpack-plugin');

const srcPath = path.resolve(__dirname, 'src');
const tplPath = path.resolve(__dirname, 'template');
const distPath = path.resolve(__dirname, 'dist');

winston.info('Injecting NativeScript plugins in template/package.json...');
const deps = require('./package.json').dependencies;
const plugins = Object.keys(deps)
  .filter(key => key.indexOf('nativescript-') !== -1)
  .reduce((obj, key) => {
    obj[key] = deps[key];
    return obj;
  }, {});
const tplPackage = require('./template/package.json');
const diff = Object.keys(plugins).filter(x => !Object.keys(tplPackage.dependencies).includes(x));
diff.map(plugin => console.log(`  ${plugin}`));
Object.assign(tplPackage.dependencies, plugins);
fs.writeFileSync(tplPath + '/package.json', JSON.stringify(tplPackage, null, 2));

winston.info('Preparing NativeScript application from template...');
fs.ensureDirSync(distPath);
fs.copySync(tplPath, distPath);
execSync('npm i', {cwd: 'dist'});

const config = (platform, action) => {
  // CSS / SCSS style extraction loaders
  const cssLoader = ExtractTextPlugin.extract({
    use: [
      {
        loader: 'css-loader',
        options: {url: false},
      },
    ],
  });
  const scssLoader = ExtractTextPlugin.extract({
    use: [
      {
        loader: 'css-loader',
        options: {
          url: false,
          includePaths: [path.resolve(__dirname, 'node_modules')],
        },
      },
      'sass-loader',
    ],
  });

  return {

    target: NativeScriptVueTarget,

    entry: srcPath + '/main.js',

    output: {
      path: distPath + '/app',
      filename: `app.${platform}.js`,
    },

    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /(node_modules)/,
          loader: 'babel-loader',
        },
        {
          test: /\.css$/,
          use: cssLoader,
        },
        {
          test: /\.scss$/,
          use: scssLoader,
        },
        {
          test: /\.vue$/,
          loader: 'ns-vue-loader',
          options: {
            loaders: {
              css: cssLoader,
              scss: scssLoader,
            },
          },
        },
      ],
    },

    resolve: {
      modules: [
        'node_modules/tns-core-modules',
        'node_modules',
      ],
      extensions: [
        `.${platform}.css`,
        '.css',
        `.${platform}.scss`,
        '.scss',
        `.${platform}.js`,
        '.js',
        `.${platform}.vue`,
        '.vue',
      ],
    },

    externals: NativeScriptVueExternals,

    plugins: [

      // Extract CSS to separate file
      new ExtractTextPlugin({filename: `app.${platform}.css`}),

      // Optimize CSS output
      new OptimizeCssAssetsPlugin({
        cssProcessor: require('cssnano'),
        cssProcessorOptions: {discardComments: {removeAll: true}},
        canPrint: false,
      }),

      // Minify JavaScript code
      new webpack.optimize.UglifyJsPlugin({
        compress: {warnings: false},
        output: {comments: false},
      }),

      // Copy src/assets/**/* to dist/
      new CopyWebpackPlugin([
        {from: 'assets', context: 'src'},
      ]),

      // Execute NativeScript action on specified platform
      new ExecTnsPlugin({
        platform,
        action,
      }),

    ],

    stats: {
      all: false,
      errors: true,
      warnings: true,
    },

    node: {
      'http': false,
      'timers': false,
      'setImmediate': false,
      'fs': 'empty',
    },

  };
};

module.exports = env => {
  let configs = [];

  // Determine platform(s) from env
  if (!env) {
    configs.push(config('android', 'build'));
    configs.push(config('ios', 'build'));
  } else {
    if (env.android) {
      configs.push(config('android', env.action || 'build'));
    }
    if (env.ios) {
      configs.push(config('ios', env.action || 'build'));
    }
  }

  return configs;
};
