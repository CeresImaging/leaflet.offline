(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('leaflet'), require('localforage'), require('geojson-bbox'), require('@mapbox/tilebelt'), require('turf-point'), require('@turf/boolean-point-in-polygon')) :
	typeof define === 'function' && define.amd ? define(['leaflet', 'localforage', 'geojson-bbox', '@mapbox/tilebelt', 'turf-point', '@turf/boolean-point-in-polygon'], factory) :
	(factory(global.L,global.localforage,global.geoBox,global.tilebelt,global.turfPoint,global.isPointInPolygon));
}(this, (function (L,localforage,geoBox,tilebelt,turfPoint,isPointInPolygon) { 'use strict';

L = L && L.hasOwnProperty('default') ? L['default'] : L;
localforage = localforage && localforage.hasOwnProperty('default') ? localforage['default'] : localforage;
geoBox = geoBox && geoBox.hasOwnProperty('default') ? geoBox['default'] : geoBox;
turfPoint = turfPoint && turfPoint.hasOwnProperty('default') ? turfPoint['default'] : turfPoint;
isPointInPolygon = isPointInPolygon && isPointInPolygon.hasOwnProperty('default') ? isPointInPolygon['default'] : isPointInPolygon;

localforage.config({
  name: 'leaflet_offline',
  version: 1.0,
  size: 4980736,
  storeName: 'tiles',
  description: 'the tiles',
});

/**
 * Determines if a set of coordinates reside within a GeoJSON shape
 */
function coordsIntersectPolygon (coords, shape) {
  var point = turfPoint(coords);

  return isPointInPolygon(point, shape)
}

/**
 * Determines if two GeoJSON shapes intersect
 */
function shapesIntersect (shape1, shape2) {
  if (shape1.type == 'Point') {
    return coordsIntersectPolygon(shape1.coordinates, shape2)
  } else if (shape1.type == 'Polygon' || shape1.type == 'MultiLineString') {
    return shape1.coordinates.some(function (coord1) {
      return coord1.some(function (coord2) {
        return coordsIntersectPolygon(coord2, shape2)
      })
    })
  } else if (shape1.type == 'MultiPolygon') {
    return shape1.coordinates.some(function (coord1) {
      return coord1.some(function (coord2) {
        return coord2.some(function (coord3) {
          return coordsIntersectPolygon(coord3, shape2)
        })
      })
    })
  } else if (shape1.type == 'Feature') {
    return shapesIntersect(shape1.geometry, shape2)
  } else if (shape1.type == 'GeometryCollection') {
    return shape1.geometries.some(function (geometry) {
      return shapesIntersect(geometry, shape2)
    })
  } else if (shape1.type == 'FeatureCollection') {
    return shape1.features.some(function (feature) {
      return shapesIntersect(feature, shape2)
    })
  }

  return false
}

/**
 * A layer that uses store tiles when available. Falls back to online.
 * Use this layer directly or extend it
 * @class TileLayerOffline
 */
var TileLayerOffline = L.TileLayer.extend(/** @lends  TileLayerOffline */ {
  /**
  * Create tile HTMLElement
  * @private
  * @param  {array}   coords [description]
  * @param  {Function} done   [description]
  * @return {HTMLElement}      [description]
  */
  createTile: function createTile (coords, done) {
    var tile = L.TileLayer.prototype.createTile.call(this, coords, done);
    var url = tile.src;

    this.setDataUrl(tile, url).then(function (dataUrl) {
      tile.src = dataUrl;
    }).catch(function () {
      tile.src = url;
    });

    return tile
  },

  /**
   * dataurl from localstorage
   * @param {DomElement} tile [description]
   * @param {string} url  [description]
   * @return {Promise} resolves to base64 url
   */
  setDataUrl: function setDataUrl (tile, url) {
    var this$1 = this;

    return new Promise(function (resolve, reject) {
      localforage.getItem(this$1._getStorageKey(url)).then(function (data) {
        if (data && typeof data === 'object') {
          resolve(URL.createObjectURL(data));
        } else {
          reject();
        }
      }).catch(function (e) { reject(e); });
    })
  },

  /**
   * get key to use for storage
   * @private
   * @param  {string} url url used to load tile
   * @return {string} unique identifier.
   */
  _getStorageKey: function _getStorageKey (url) {
    var key;
    var subdomainpos = this._url.indexOf('{s}');

    if (subdomainpos > 0) {
      key = url.substring(0, subdomainpos) +
        this.options.subdomains['0'] +
        url.substring(subdomainpos + 1, url.length);
    }

    return key || url
  },

  /**
   * @return {number} Number of simultanous downloads from tile server
   */
  getSimultaneous: function getSimultaneous () {
    return this.options.subdomains.length
  },

  /**
   * getTileUrls for single zoomlevel
   * @param  {object} L.latLngBounds
   * @param  {number} zoom
   * @return {object[]} the tile urls, key, url
   */
  getTileUrls: function getTileUrls (bounds, zoom) {
    var this$1 = this;

    var tiles = [];
    var origurl = this._url;

    // getTileUrl uses current zoomlevel, we want to overwrite it
    this.setUrl(this._url.replace('{z}', zoom), true);

    var pointBounds = L.bounds(
      this._map.project(bounds.getNorthWest(), zoom),
      this._map.project(bounds.getSouthEast(), zoom)
    );

    var tileBounds = L.bounds(
      pointBounds.min.divideBy(this.getTileSize().x).floor(),
      pointBounds.max.divideBy(this.getTileSize().x).floor()
    );

    for (var j = tileBounds.min.y; j <= tileBounds.max.y; j += 1) {
      for (var i = tileBounds.min.x; i <= tileBounds.max.x; i += 1) {
        var tilePoint = new L.Point(i, j);
        var url = L.TileLayer.prototype.getTileUrl.call(this$1, tilePoint);

        tiles.push({
          key: this$1._getStorageKey(url),
          url: url,
        });
      }
    }

    // restore url
    this.setUrl(origurl, true);

    return tiles
  },

  /**
   * Gets the tile URLs for a non-rectangular shape (GeoJSON) at the defined zoom level
   * @param  {GeoJSON} shapes
   * @param  {number} zoom
   * @return {object[]} the tile urls, key, url
   */
  getTileUrlsInShapes: function getTileUrlsInShapes (shapes, zoom) {
    var this$1 = this;

    var tiles = [];
    var origUrl = this._url;
    var geometries = shapes instanceof Array ? shapes : [shapes];

    console.log('[leaflet.offline] getting tile urls for zoom level', zoom, geometries);

    this.setUrl(this._url.replace('{z}', zoom), true);

    geometries.forEach(function (shape) {
      L.geoJSON(shape, { style: { color: 'yellow' } }).addTo(this$1._map);

      var boundCoords = geoBox(shape);
      var boundLatLngs = new L.latLngBounds(L.GeoJSON.coordsToLatLngs([
        [boundCoords[0], boundCoords[1]],
        [boundCoords[2], boundCoords[3]]
      ]));

      var pointBounds = L.bounds(
        this$1._map.project(boundLatLngs.getNorthWest(), zoom),
        this$1._map.project(boundLatLngs.getSouthEast(), zoom)
      );

      var tileBounds = L.bounds(
        pointBounds.min.divideBy(this$1.getTileSize().x).floor(),
        pointBounds.max.divideBy(this$1.getTileSize().x).floor()
      );

      for (var j = tileBounds.min.y; j <= tileBounds.max.y; j += 1) {
        for (var i = tileBounds.min.x; i <= tileBounds.max.x; i += 1) {
          var tilePoint = new L.Point(i, j);
          var tileShape = tilebelt.tileToGeoJSON([tilePoint.x, tilePoint.y, zoom]);
          var tileIntersects = shapesIntersect(tileShape, shape) || shapesIntersect(shape, tileShape);

          if (tileIntersects) {
            var url = L.TileLayer.prototype.getTileUrl.call(this$1, tilePoint);

            L.geoJSON(tileShape, { style: { color: 'teal' } }).addTo(this$1._map);

            tiles.push({
              key: this$1._getStorageKey(url),
              url: url,
            });
          }
        }
      }
    });

    // restore url
    this.setUrl(origUrl, true);

    console.log('[leaflet.offline] returning tiles for zoom level', zoom, tiles.length);

    return tiles
  }
});

/**
* Tiles removed event
* @event storagesize
* @memberof TileLayerOffline
* @type {object}
*/

/**

 * Start saving tiles
 * @event savestart
 * @memberof TileLayerOffline
 * @type {object}
 */

/**
 * Tile fetched
 * @event loadtileend
 * @memberof TileLayerOffline
 * @type {object}
 */

/**
 * All tiles fetched
 * @event loadend
 * @memberof TileLayerOffline
 * @type {object}
 */

/**
 * Tile saved
 * @event savetileend
 * @memberof TileLayerOffline
 * @type {object}
 */

/**
 * All tiles saved
 * @event saveend
 * @memberof TileLayerOffline
 * @type {object}
 */

/**
 * Tile removed
 * @event tilesremoved
 * @memberof TileLayerOffline
 * @type {object}
 */

/**
 * @function L.tileLayer.offline
 * @param  {string} url [description]
 * @param  {object} options {@link http://leafletjs.com/reference-1.2.0.html#tilelayer}
 * @return {TileLayerOffline} an instance of TileLayerOffline
 */
L.tileLayer.offline = function (url, options) { return new TileLayerOffline(url, options); };

/**
 * Status of ControlSaveTiles, keeps info about process during downloading
 * and saving tiles. Used internal and as object for events.
 *
 * @typedef {Object} ControlStatus
 * @property {number} storagesize total number of saved tiles.
 * @property {number} lengthToBeSaved number of tiles that will be saved in db
 * during current process
 * @property {number} lengthSaved number of tiles saved during current process
 * @property {number} lengthLoaded number of tiles loaded during current process
 * @property {array} _tilesforSave tiles waiting for processing
 */


/**
 * Shows control on map to save tiles
 * @class ControlSaveTiles
 *
 * @property {ControlStatus} status
 */
var ControlSaveTiles = L.Control.extend(/** @lends ControlSaveTiles */ {
  options: {
    position: 'topleft',
    saveText: '+',
    rmText: '-',
    maxZoom: 19,
    saveWhatYouSee: false,
    bounds: null,
    confirm: null,
    confirmRemoval: null,
  },

  status: {
    storagesize: null,
    lengthToBeSaved: null,
    lengthSaved: null,
    lengthLoaded: null,
    lengthProcessed: null,
    lengthFailed: null,
    cancelled: false,
    _tilesforSave: null,
  },

  /**
   * @private
   * @param  {Object} baseLayer
   * @param  {Object} options
   * @return {void}
   */
  initialize: function initialize (baseLayer, options) {
    this._baseLayer = baseLayer;
    this.setStorageSize();

    L.setOptions(this, options);
  },

  /**
   * Set storagesize prop on object init
   * @param {Function} [callback] receives arg number of saved files
   * @private
   */
  setStorageSize: function setStorageSize (callback) {
    var self = this;

    if (this.status.storagesize && callback instanceof Function) {
      callback(this.status.storagesize);

      return
    }

    localforage.length().then(function (numberOfKeys) {
      self.status.storagesize = numberOfKeys;

      self._baseLayer.fire('storagesize', self.status);

      if (callback) {
        callback(numberOfKeys);
      }
    }).catch(function (err) {
      callback(0);

      throw err
    });
  },

  /**
   * get number of saved files

   * @param  {Function} callback [description]
   * @private
   */
  getStorageSize: function getStorageSize (callback) {
    this.setStorageSize(callback);
  },

  /**
   * Change baseLayer
   * @param {TileLayerOffline} layer
   */
  setLayer: function setLayer (layer) {
    this._baseLayer = layer;
  },

  /**
   * set the bounds of the area to save
   * @param {L.latLngBounds} bounds
   */
  setBounds: function setBounds (bounds) {
    this.options.bounds = bounds;
  },

  /**
   * set the shape(s) of the area to save
   *@param {GeoJSON} bounds
   */
  setShapes: function setShapes (shapes) {
    this.options.shapes = shapes;
  },

  /**
   * set saveWhatYouSee
   * @param {boolean} saveWhatYouSee
   */
  setSaveWhatYouSee: function setSaveWhatYouSee (saveWhatYouSee) {
    this.options.saveWhatYouSee = saveWhatYouSee;
  },

  /**
   * set the maxZoom
   * @param {number} zoom
   */
  setMaxZoom: function setMaxZoom (zoom) {
    this.options.maxZoom = zoom;
  },

  /**
   * set the zoomLevels
   * @param {array} zoomLevels min,max
   */
  setzoomLevels: function setzoomLevels (zoomLevels) {
    this.options.zoomLevels = zoomLevels;
  },

  onAdd: function onAdd () {
    var container = L.DomUtil.create('div', 'savetiles leaflet-bar');
    var ref = this;
    var options = ref.options;

    this._createButton(options.saveText, 'savetiles', container, this._saveTiles);
    this._createButton(options.rmText, 'rmtiles', container, this._rmTiles);

    return container
  },

  _createButton: function _createButton (html, className, container, fn) {
    var link = L.DomUtil.create('a', className, container);

    link.innerHTML = html;
    link.href = '#';

    L.DomEvent
      .on(link, 'mousedown dblclick', L.DomEvent.stopPropagation)
      .on(link, 'click', L.DomEvent.stop)
      .on(link, 'click', fn, this)
      .on(link, 'click', this._refocusOnMap, this);
    // TODO enable disable on layer change map

    return link
  },

  /**
   * starts processing tiles
   * @private
   * @return {void}
   */
  _saveTiles: function _saveTiles () {
    var this$1 = this;

    var self = this;
    // minimum zoom to prevent the user from saving the whole world
    var minZoom = 5;

    // current zoom or zoom options
    var zoomLevels = [];
    var tiles = [];

    if (this.options.saveWhatYouSee) {
      var currentZoom = this._map.getZoom();

      if (currentZoom < minZoom) {
        throw new Error('It\'s not possible to save with zoom below level 5.')
      }

      var ref = this.options;
      var maxZoom = ref.maxZoom;

      for (var zoom = currentZoom; zoom <= maxZoom; zoom += 1) {
        zoomLevels.push(zoom);
      }
    } else {
      zoomLevels = this.options.zoomLevels || [this._map.getZoom()];
    }

    console.log('[leaflet.offline] saving tiles at zoom levels', zoomLevels);

    var bounds = this.options.bounds || this._map.getBounds();
    var shapes = this.options.shapes;

    for (var i in zoomLevels) {
      var tileUrlFactory = this$1._baseLayer[shapes ? 'getTileUrlsInShapes' : 'getTileUrls'].bind(this$1._baseLayer);
      var tileUrlSource  = shapes || bounds;
      var tileUrls = tileUrlFactory(tileUrlSource, zoomLevels[i]);

      tiles = tiles.concat(tileUrls);
    }

    this._resetStatus(tiles);

    var successCallback = function () {
      self._baseLayer.fire('savestart', self.status);

      var subdLength = self._baseLayer.getSimultaneous();

      for (var i = 0; i < subdLength; i += 1) {
        self._loadTile();
      }
    };

    if (this.options.confirm) {
      this.options.confirm(this.status, successCallback);
    } else {
      successCallback();
    }
  },

  /**
   * aborts the tile download process
   * @return {void}
   */
  cancel: function cancel () {
    this._baseLayer.fire('savecancelled', self.status);
    this._resetStatus();

    this.status.cancelled = true;
  },

  /**
   * resets the status of the download session
   * @private
   * @param  {Array<string>} list of tiles to refresh session with
   * @return {void}
   */
  _resetStatus: function _resetStatus (tiles) {
    if ( tiles === void 0 ) tiles = [];

    this.status = {
      lengthLoaded: 0,
      lengthProcessed: 0,
      lengthFailed: 0,
      lengthToBeSaved: tiles.length,
      lengthSaved: 0,
      cancelled: false,
      _tilesforSave: tiles,
    };
  },

  /**
   * Loop over status._tilesforSave prop till all tiles are downloaded
   * Calls _saveTile for each download
   * @private
   * @param  {string} tileUrl
   * @return {void}
   */
  _loadTile: function _loadTile () {
    if (this.status.cancelled) { return }

    var self = this;
    var tileUrl = self.status._tilesforSave.shift();
    var xhr = new XMLHttpRequest();

    xhr.open('GET', tileUrl.url);
    xhr.responseType = 'blob';
    xhr.send();
    xhr.onreadystatechange = function () {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        if (xhr.status === 200) {
          self.status.lengthLoaded += 1;
          self.status.lengthProcessed += 1;

          self._saveTile(tileUrl.key, xhr.response);

          if (self.status._tilesforSave.length > 0) {
            self._loadTile();
            self._baseLayer.fire('loadtileend', self.status);
          } else {
            self._baseLayer.fire('loadtileend', self.status);

            if (self.status.lengthProcessed === self.status.lengthToBeSaved) {
              self._baseLayer.fire('loadend', self.status);
            }
          }
        }

        if (xhr.status >= 400) {
          self.status.lengthProcessed += 1;
          self.status.lengthFailed += 1;

          self._baseLayer.fire('loadtilefailed', self.status);

          if (self.status._tilesforSave.length > 0) {
            self._loadTile();
            self._baseLayer.fire('loadtileend', self.status);
          }
        }
      }
    };
  },

  /**
   * saves a loaded tile using localforage
   * @private
   * @param  {string} tileUrl save key
   * @param  {blob} blob binary representation of tile image
   * @return {void}
   */
  _saveTile: function _saveTile (tileUrl, blob) {
    var self = this;

    localforage.removeItem(tileUrl).then(function () {
      localforage.setItem(tileUrl, blob).then(function () {
        self.status.lengthSaved += 1;
        //self.status.lengthProcessed += 1
        self._baseLayer.fire('savetileend', self.status);

        if (self.status.lengthSaved === self.status.lengthToBeSaved) {
          self._baseLayer.fire('saveend', self.status);
          self.setStorageSize();
        }
      }).catch(function (error) {
        self._baseLayer.fire('saveerror', { status: self.status, error: error });

        throw new Error(error)
      });
    }).catch(function (error) {
      throw new Error(error)
    });
  },

  /**
   * removes all saves tiles from localforage
   * @private
   * @return {void}
   */
  _rmTiles: function _rmTiles () {
    var self = this;
    var successCallback = function () {
      localforage.clear().then(function () {
        self.status.storagesize = 0;
        self._baseLayer.fire('tilesremoved');
        self._baseLayer.fire('storagesize', self.status);
      });
    };

    if (this.options.confirmRemoval) {
      this.options.confirmRemoval(this.status, successCallback);
    } else {
      successCallback();
    }
  },
});

/**
* @function L.control.savetiles
* @param  {object} baseLayer     {@link http://leafletjs.com/reference-1.2.0.html#tilelayer}
* @property {Object} options
* @property {string} [options.position] default topleft
* @property {string} [options.saveText] html for save button, default +
* @property {string} [options.rmText] html for remove button, deflault -
* @property {number} [options.maxZoom] maximum zoom level that will be reached
* when saving tiles with saveWhatYouSee. Default 19
* @property {boolean} [options.saveWhatYouSee] save the tiles that you see
* on screen plus deeper zooms, ignores zoomLevels options. Default false
* @property {function} [options.confirm] function called before confirm, default null.
* Args of function are ControlStatus and callback.
* @property {function} [options.confirmRemoval] function called before confirm, default null
* @return {ControlSaveTiles}
*/
L.control.savetiles = function (baseLayer, options) { return new ControlSaveTiles(baseLayer, options); };

})));
