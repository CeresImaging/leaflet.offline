import L from 'leaflet';
import localforage from './localforage';
import geoBox from 'geojson-bbox';
import { tileToGeoJSON } from '@mapbox/tilebelt';
import { polygonsIntersect } from './GeoUtils';

// https://codepen.io/slurmulon/pen/zRVzjX


/**
 * A layer that uses store tiles when available. Falls back to online.
 * Use this layer directly or extend it
 * @class TileLayerOffline
 */
const TileLayerOffline = L.TileLayer.extend(/** @lends  TileLayerOffline */ {
  /**
  * Create tile HTMLElement
  * @private
  * @param  {array}   coords [description]
  * @param  {Function} done   [description]
  * @return {HTMLElement}          [description]
  */
  createTile(coords, done) {
    const tile = L.TileLayer.prototype.createTile.call(this, coords, done);
    const url = tile.src;
    tile.src = undefined;
    this.setDataUrl(tile, url).then((dataurl) => {
      tile.src = dataurl;
    }).catch(() => {
      tile.src = url;
    });
    return tile;
  },
  /**
   * dataurl from localstorage
   * @param {DomElement} tile [description]
   * @param {string} url  [description]
   * @return {Promise} resolves to base64 url
   */
  setDataUrl(tile, url) {
    return new Promise((resolve, reject) => {
      localforage.getItem(this._getStorageKey(url)).then((data) => {
        if (data && typeof data === 'object') {
          resolve(URL.createObjectURL(data));
        } else {
          reject();
        }
      }).catch((e) => { reject(e); });
    });
  },
  /**
   * get key to use for storage
   * @private
   * @param  {string} url url used to load tile
   * @return {string} unique identifier.
   */
  _getStorageKey(url) {
    let key;
    const subdomainpos = this._url.indexOf('{s}');
    if (subdomainpos > 0) {
      key = url.substring(0, subdomainpos) +
        this.options.subdomains['0'] +
        url.substring(subdomainpos + 1, url.length);
    }
    return key || url;
  },
  /**
   * @return {number} Number of simultanous downloads from tile server
   */
  getSimultaneous() {
    return this.options.subdomains.length;
  },
  /**
   * getTileUrls for single zoomlevel
   * @param  {object} L.latLngBounds
   * @param  {number} zoom
   * @return {object[]} the tile urls, key, url
   */
  getTileUrls(bounds, zoom) {
    const tiles = []
    const origurl = this._url

    // getTileUrl uses current zoomlevel, we want to overwrite it
    this.setUrl(this._url.replace('{z}', zoom), true)

    const pointBounds = L.bounds(
      this._map.project(bounds.getNorthWest(), zoom),
      this._map.project(bounds.getSouthEast(), zoom)
    )

    console.log(`[leaflet.offline] getTileUrls latLngBounds @ [zoom: ${zoom}]`, bounds)
    console.log(`[leaflet.offline] getTileUrls pointBounds @ [zoom: ${zoom}]`, pointBounds)

    const tileBounds = L.bounds(
      pointBounds.min.divideBy(this.getTileSize().x).floor(),
      pointBounds.max.divideBy(this.getTileSize().x).floor()
    )

    console.log(`[leaflet.offline] getTileUrls tileBounds @ [zoom: ${zoom}]`, tileBounds)

    let url

    for (let j = tileBounds.min.y; j <= tileBounds.max.y; j += 1) {
      for (let i = tileBounds.min.x; i <= tileBounds.max.x; i += 1) {
        const tilePoint = new L.Point(i, j)

        // console.log('---- created tile [point, latlng]', tilePoint, this._map.unproject(tilePoint))
        console.log('---- created tile [point, latlng latlng_better]', tilePoint, this._map.unproject(tilePoint, zoom), this._map.layerPointToLatLng(tilePoint))

        url = L.TileLayer.prototype.getTileUrl.call(this, tilePoint)

        tiles.push({
          key: this._getStorageKey(url),
          url,
        })
      }
    }

    // restore url
    this.setUrl(origurl, true)

    return tiles
  },
  /**
   * Provides the tile URLs for a non-rectangular shape (GeoJSON) at the provided zoom level
   */
  getTileUrlsInShapes (shapes, zoom) {
    const tiles = []
    const origUrl = this._url

    this.setUrl(this._url.replace('{z}', zoom), true)

    const geometries = shapes instanceof Array ? shapes : [shapes]
    const latLngBounds = geometries.map(geoBox)

    console.log('[leaflet.offline] shape lat/lng bound/coords', latLngBounds)
    
    // TODO: probably wrap this in `new L.latLngBounds`
    // const coordsAsLatLngs = L.GeoJSON.coordsToLatLngs(latLngBounds)
    const coordsAsLatLngs = L.GeoJSON.coordsToLatLngs([[latLngBounds[0][0], latLngBounds[0][1]], [latLngBounds[0][2], latLngBounds[0][3]]])
    // const coordsAsLatLngs = L.GeoJSON.coordsToLatLngs([[latLngBounds[0], latLngBounds[1]], [latLngBounds[2], latLngBounds[3]]])

    console.log('[leaflet.offline] shape geo coords as lat/lng', coordsAsLatLngs)
    const latLngPoints = new L.latLngBounds(coordsAsLatLngs)

    console.log('[leaflet.offline] shape geo points', latLngPoints, latLngPoints.toBBoxString())

    const pointBounds = L.bounds(
      this._map.project(latLngPoints.getNorthWest(), zoom),
      this._map.project(latLngPoints.getSouthEast(), zoom)
    )

    const tileBounds = L.bounds(
      pointBounds.min.divideBy(this.getTileSize().x).floor(),
      pointBounds.max.divideBy(this.getTileSize().x).floor()
    )

    let url

    for (let j = tileBounds.min.y; j <= tileBounds.max.y; j += 1) {
      for (let i = tileBounds.min.x; i <= tileBounds.max.x; i += 1) {
        geometries.forEach(shape => {
          const tilePoint = new L.Point(i, j)
          const tileShape = tileToGeoJSON([tilePoint.x, tilePoint.y, zoom])
          const tileIntersects = polygonsIntersect(tileShape, shape)

          if (tileIntersects) {
            console.log('[leaflet.offline] added tile point (in shape!)', tilePoint)
            url = L.TileLayer.prototype.getTileUrl.call(this, tilePoint)

            tiles.push({
              key: this._getStorageKey(url),
              url,
            })
          }
        })
      }
    }

    // restore url
    this.setUrl(origUrl, true)

    return tiles
  }
})

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
 * @param  {string} url     [description]
 * @param  {object} options {@link http://leafletjs.com/reference-1.2.0.html#tilelayer}
 * @return {TileLayerOffline}      an instance of TileLayerOffline
 */
L.tileLayer.offline = (url, options) => new TileLayerOffline(url, options);
