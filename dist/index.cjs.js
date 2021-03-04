'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var path = _interopDefault(require('path'));
var fs = _interopDefault(require('fs'));
var util = _interopDefault(require('util'));
var crypto = _interopDefault(require('crypto'));
var pluginutils = require('@rollup/pluginutils');
var chalk = _interopDefault(require('chalk'));
var mkpath = _interopDefault(require('mkpath'));
var imageminVendor = _interopDefault(require('imagemin'));
var imageminJpegtran = _interopDefault(require('imagemin-mozjpeg'));
var imageminPngquant = _interopDefault(require('imagemin-optipng'));
var imageminGifsicle = _interopDefault(require('imagemin-gifsicle'));
var imageminSvgo = _interopDefault(require('imagemin-svgo'));

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }

  return obj;
}

function ownKeys(object, enumerableOnly) {
  var keys = Object.keys(object);

  if (Object.getOwnPropertySymbols) {
    keys.push.apply(keys, Object.getOwnPropertySymbols(object));
  }

  if (enumerableOnly) keys = keys.filter(function (sym) {
    return Object.getOwnPropertyDescriptor(object, sym).enumerable;
  });
  return keys;
}

function _objectSpread2(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] != null ? arguments[i] : {};

    if (i % 2) {
      ownKeys(source, true).forEach(function (key) {
        _defineProperty(target, key, source[key]);
      });
    } else if (Object.getOwnPropertyDescriptors) {
      Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    } else {
      ownKeys(source).forEach(function (key) {
        Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
      });
    }
  }

  return target;
}

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const mkpathAsync = util.promisify(mkpath); // Returns a new object each time, so that it can't be modified (while it is exported)
// It is required to export this value for testing

const getDefaultOptions = () => JSON.parse(JSON.stringify({
  disable: false,
  verbose: false,
  emitFiles: true,
  hashLength: 16,
  include: "**/*.{svg,png,jpg,jpeg,gif}",
  exclude: "",
  fileName: "[name]-[hash][extname]",
  publicPath: "",
  preserveTree: false,
  jpegtran: {
    progressive: true
  },
  pngquant: {
    speed: 1,
    strip: true
  },
  gifsicle: {
    optimizationLevel: 3
  },
  svgo: {
    precision: 1,
    multipass: true
  },
  plugins: {}
}));

const dropUndefinedKeys = obj => Object.entries(obj).reduce((acc, [key, val]) => {
  if (typeof val !== "undefined") {
    acc[key] = val;
  }

  return acc;
}, {});

function imagemin(userOptions = {}) {
  // Default options
  const defaultOptions = getDefaultOptions(); // Remove `undefined` user options

  userOptions = dropUndefinedKeys(userOptions); // Inject default plugin factories

  const allPluginsFactories = _objectSpread2({
    jpegtran: imageminJpegtran,
    pngquant: imageminPngquant,
    gifsicle: imageminGifsicle,
    svgo: imageminSvgo
  }, userOptions.plugins); // Get pairs to use array functions


  const allPluginsFactoriesPairs = Object.entries(allPluginsFactories); // Merge 1st level options

  const pluginOptions = _objectSpread2({}, defaultOptions, {}, userOptions); // Merge user options with defaults for each plugin


  allPluginsFactoriesPairs.reduce((pluginOptionsAcc, [pluginName]) => {
    // Remove `undefined` plugin user options
    const pluginUserOpts = dropUndefinedKeys(userOptions[pluginName] || {});
    pluginOptionsAcc[pluginName] = _objectSpread2({}, defaultOptions[pluginName], {}, pluginUserOpts);
    return pluginOptionsAcc;
  }, pluginOptions); // Run factories

  pluginOptions.plugins = allPluginsFactoriesPairs.map(([pluginName, factoryFunction]) => factoryFunction(pluginOptions[pluginName]));
  const filter = pluginutils.createFilter(pluginOptions.include, pluginOptions.exclude);
  const logPrefix = "imagemin:";
  let assets = {};
  return {
    name: "imagemin",

    buildStart() {
      if (pluginOptions.verbose && pluginOptions.disable) {
        pluginOptions.disable ? console.log(chalk.yellow.bold(`${logPrefix} Skipping image optimizations.`)) : console.log(chalk.green.bold(`${logPrefix} Optimizing images...`));
      }
    },

    load(id) {
      id = path.resolve(id); // Normalise id to match native representation. Required if used with Vite which uses Unix style paths for id.

      if (!filter(id)) {
        return null;
      }

      return readFile(id).then(buffer => {
        const extname = path.extname(id);
        const name = pluginOptions.preserveTree ? typeof pluginOptions.preserveTree === "string" ? path.join(path.dirname(id.replace(`${path.resolve(pluginOptions.preserveTree)}${path.sep}`, "")), path.basename(id, extname)) : path.join(path.dirname(id.replace(`${process.cwd()}${path.sep}`, "")), path.basename(id, extname)) : path.basename(id, extname);
        let hash, outputFileName;

        if (!pluginOptions.disable) {
          return imageminVendor.buffer(buffer, {
            plugins: pluginOptions.plugins
          }).then(optimizedBuffer => {
            hash = crypto.createHash("sha1").update(optimizedBuffer).digest("hex").substr(0, pluginOptions.hashLength);
            outputFileName = path.join(pluginOptions.fileName.replace(/\[name\]/i, name).replace(/\[hash\]/i, hash).replace(/\[extname\]/i, extname)).replace(/\\/g, "/");
            assets[outputFileName] = optimizedBuffer;

            if (pluginOptions.verbose) {
              const inputSize = buffer.toString().length;
              const outputSize = optimizedBuffer.toString().length;
              const smaller = outputSize < inputSize;
              const difference = Math.round(Math.abs(outputSize / inputSize * 100 - 1));
              console.log(chalk.green.bold(`${logPrefix} Optimized ${outputFileName}: ${smaller ? `~${difference}% smaller 🎉` : chalk.red(`~${difference}% bigger 🤕`)}`));
            }

            return `export default new URL("${pluginOptions.publicPath}${outputFileName}", import.meta.url).href;`;
          }).catch(error => {
            this.error(`${logPrefix} Couldn't optimize image: ${error}`);
          });
        } else {
          hash = crypto.createHash("sha1").update(buffer).digest("hex").substr(0, pluginOptions.hashLength);
          outputFileName = path.join(pluginOptions.fileName.replace(/\[name\]/i, name).replace(/\[hash\]/i, hash).replace(/\[extname\]/i, extname)).replace(/\\/g, "/");
          assets[outputFileName] = buffer;
          return `export default new URL("${pluginOptions.publicPath}${outputFileName}", import.meta.url).href;`;
        }
      }).catch(error => {
        this.error(`${logPrefix} Couldn't read asset from disk: ${error}`);
      });
    },

    generateBundle(rollupOptions) {
      if (!pluginOptions.emitFiles) {
        return;
      }

      const base = rollupOptions.dir || path.dirname(rollupOptions.file);
      return Promise.all(Object.keys(assets).map(name => {
        const assetBase = path.resolve(path.dirname(path.join(base, name)));
        return mkpathAsync(assetBase).then(() => {
          return writeFile(path.join(base, name), assets[name]).catch(error => {
            this.error(`${logPrefix} Couldn't write optimized input buffer for ${name}: ${error}`);
          });
        });
      }));
    }

  };
}

exports.getDefaultOptions = getDefaultOptions;
exports.imagemin = imagemin;
//# sourceMappingURL=index.cjs.js.map
