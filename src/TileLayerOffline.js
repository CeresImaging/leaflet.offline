import L from 'leaflet';
import geoUtils from 'geojson-utils'
import geoBox from 'geojson-bbox'
import localforage from './localforage';


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

    console.log('[leaflet.offline] shapes (original)', shapes)

    // const latLngBounds = L.bounds((shapes instanceof Array ? shapes : [shapes]).map(geoBox))

    // console.log('[leaflet.offline] shape lat/lng bounds', latLngBounds)

    // const pointBounds = L.bounds(
    //   this._map.project(latLngBounds.getNorthWest(), zoom),
    //   this._map.project(latLngBounds.getSouthEast(), zoom)
    // )
    //

    const geometries = shapes instanceof Array ? shapes : [shapes]

    const latLngBounds = geometries.map(geoBox)
    // const latLngPoints = [
    //   L.point(latLngBounds[0][0], latLngBounds[0][1]),
    //   L.point(latLngBounds[0][2], latLngBounds[0][3])
    // ]

    // BORKED (non-existent lat/lng)
    // const latLngPoints = new L.latLngBounds([
    //   L.latLng(latLngBounds[0][0], latLngBounds[0][1]),
    //   L.latLng(latLngBounds[0][2], latLngBounds[0][3])
    // ])

    // BORKED (non-existent lat/lng)
    const latLngPoints = new L.latLngBounds([
      L.latLng(latLngBounds[0][1], latLngBounds[0][0]),
      L.latLng(latLngBounds[0][3], latLngBounds[0][2])
    ])

    console.log('[leaflet.offline] shape geo bounds', latLngBounds)
    console.log('[leaflet.offline] shape geo points', latLngPoints, latLngPoints.toBBoxString())

    const pointBounds = L.bounds(
      this._map.project(latLngPoints.getNorthWest(), zoom),
      this._map.project(latLngPoints.getSouthEast(), zoom)
    )
    // const pointBounds = L.bounds(L.point(minLng, minLat), L.point(maxLng, maxLat))

    // console.log('[leaflet.offline] shape point bounds [orig, unprojected]', { min: this._map.unproject(pointBounds.min), max: this._map.unproject(pointBounds.max) })
    console.log('[leaflet.offline] shape point bounds [orig, unprojected, unprojected_better]', { min: this._map.unproject(pointBounds.min, zoom), max: this._map.unproject(pointBounds.max, zoom) }, { min: this._map.layerPointToLatLng(pointBounds.min), max: this._map.layerPointToLatLng(pointBounds.max) })


    // FIXME: this isn't right. min/max are identical...?
    //  - these should be point bounds but are in lat/lng... weird
    const tileBounds = L.bounds(
      pointBounds.min.divideBy(this.getTileSize().x).floor(),
      pointBounds.max.divideBy(this.getTileSize().x).floor()
    )

    console.log('[leaflet.offline] shape tile bounds [bounds, tile-size]', tileBounds, this.getTileSize())

    let url

    for (let j = tileBounds.min.y; j <= tileBounds.max.y; j += 1) {
      for (let i = tileBounds.min.x; i <= tileBounds.max.x; i += 1) {
        geometries.forEach(shape => {
          const tilePoint = new L.Point(i, j)
          // const tileLatLng = this._map.unproject(tilePoint)
          // const tileLatLng = this._map.unproject(tilePoint, zoom)
          const tileLatLng = this._map.layerPointToLatLng(tilePoint)

          console.log(`[leaflet.offline] ---- testing point against shape [zoom: ${zoom}]`, tilePoint, tileLatLng, shape)

          // FIXME: this is never matching for some reason (`tiles` is always empty...?)
          //  - it's probably because we converted to x/y when the original shape is using lat/lng
          // if (geoUtils.pointInPolygon({ type: "Point", coordinates: [tilePoint.x, tilePoint.y] }, shape)) {
          if (geoUtils.pointInPolygon({ type: "Point", coordinates: [tileLatLng.lng, tileLatLng.lat] }, shape)) {
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
