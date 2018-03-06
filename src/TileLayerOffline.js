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

    console.log('[leaflet.offline] L object', L)
    console.log('[leaflet.offline] shapes map pixel origin', this._map.getPixelOrigin())
    console.log('[leaflet.offline] shapes [original, zoom]', shapes, zoom)

    // const latLngBounds = L.bounds((shapes instanceof Array ? shapes : [shapes]).map(geoBox))

    // console.log('[leaflet.offline] shape lat/lng bounds', latLngBounds)

    // const pointBounds = L.bounds(
    //   this._map.project(latLngBounds.getNorthWest(), zoom),
    //   this._map.project(latLngBounds.getSouthEast(), zoom)
    // )
    //

    const geometries = shapes instanceof Array ? shapes : [shapes]

    // TODO: rename to `latLngCoords`
    const latLngBounds = geometries.map(geoBox)
    const latLngCoords = latLngBounds

    // const latLngPoints = [
    //   L.point(latLngBounds[0][0], latLngBounds[0][1]),
    //   L.point(latLngBounds[0][2], latLngBounds[0][3])
    // ]

    // BORKED (wrong lat/lng)
    // const latLngPoints = new L.latLngBounds([
    //   L.latLng(latLngBounds[0][0], latLngBounds[0][1]),
    //   L.latLng(latLngBounds[0][2], latLngBounds[0][3])
    // ])

    // BORKED but IDEAL (wrong lat/lng)
    //  - I think this may be wrong and causing `latLngToLayerPoint` to return a slightly skewed result
    // const latLngPoints = new L.latLngBounds([
    //   L.latLng(latLngBounds[0][1], latLngBounds[0][0]),
    //   L.latLng(latLngBounds[0][3], latLngBounds[0][2])
    // ])
    //
    //
    console.log('[leaflet.offline] shape lat/lng bound/coords', latLngCoords)
    
    // TODO: probably wrap this in `new L.latLngBounds`
    // const coordsAsLatLngs = L.GeoJSON.coordsToLatLngs(latLngBounds)
    const coordsAsLatLngs = L.GeoJSON.coordsToLatLngs([[latLngCoords[0][0], latLngCoords[0][1]], [latLngCoords[0][2], latLngCoords[0][3]]])
    // WARN: highly inefficient (probably just wrong)
    // const coordsAsLatLngs = L.GeoJSON.coordsToLatLngs([[latLngCoords[0][2], latLngCoords[0][3]], [latLngCoords[0][1], latLngCoords[0][2]]])


    console.log('[leaflet.offline] shape geo coords as lat/lng', coordsAsLatLngs)
    // OK: this value looks good
    const latLngPoints = new L.latLngBounds(coordsAsLatLngs)
    // const latLngPoints = new L.latLngBounds([
    //   L.latLng(coordsAsLatLngs[0], coordsAsLatLngs[1]),
    //   L.latLng(coordsAsLatLngs[2], coordsAsLatLngs[3])
    // ])

    console.log('[leaflet.offline] shape geo bounds', latLngBounds)
    console.log('[leaflet.offline] shape geo points', latLngPoints, latLngPoints.toBBoxString())

    const pointBounds = L.bounds(
      // this._map.project(latLngPoints.getNorthWest(), zoom),
      // this._map.project(latLngPoints.getSouthEast(), zoom)
      // !!! produces much more accurate results, but not nearly as many... lol
      this._map.latLngToLayerPoint(latLngPoints.getNorthWest(), zoom),
      this._map.latLngToLayerPoint(latLngPoints.getSouthEast(), zoom)
    )
    // const pointBounds = L.bounds(L.point(minLng, minLat), L.point(maxLng, maxLat))

// EXPERIMENTAL: testing whether or not this improves the accuracy of `unproject`
    console.log('[leaflet.offline] shape point bounds', pointBounds)
    // console.log('[leaflet.offline] shape point bounds [orig, unprojected]', { min: this._map.unproject(pointBounds.min), max: this._map.unproject(pointBounds.max) })
    // console.log('[leaflet.offline] shape point bounds [orig, unprojected, unprojected_better]', pointBounds, { min: this._map.unproject(pointBounds.min, zoom), max: this._map.unproject(pointBounds.max, zoom) }, { min: this._map.layerPointToLatLng(pointBounds.min), max: this._map.layerPointToLatLng(pointBounds.max) })

    console.log('[leaflet.offline] shape lat/lng first bound to point', this._map.latLngToLayerPoint(L.latLng(latLngBounds[0][1], latLngBounds[0][0])))

    // FIXME: this isn't right. min/max are identical...?
    //  - these should be point bounds but are in lat/lng... weird
    const tileBounds = L.bounds(
      pointBounds.min.divideBy(this.getTileSize().x).floor(),
      pointBounds.max.divideBy(this.getTileSize().x).floor()
    )

    // EXPERIMENTAL: testing whether or not this improves the accuracy of `unproject`
    // WARN: highly inefficient since it needlessly goes through every single pixel instead of 256 at a time (i.e. the width of a tile)
    // const tileBounds = pointBounds

    console.log('[leaflet.offline] shape tile bounds [bounds, tile-size]', tileBounds, this.getTileSize())

    let url

    for (let j = tileBounds.min.y; j <= tileBounds.max.y; j += 1) {
      for (let i = tileBounds.min.x; i <= tileBounds.max.x; i += 1) {
        geometries.forEach(shape => {
          const tilePoint = new L.Point(i, j)

          // const tileLatLng = this._map.unproject(tilePoint)
          // FIXME: should work..?
          //  - probably has something to do with `pointBounds`. It's divided by the tile size.
          // TODO: could use `wrapLatLng` to ensure the value isn't invalid (too great)
          //  - @see https://github.com/Leaflet/Leaflet/blob/f6e1a9be91fdfd1143d05799fdb7cef0b216ceaf/src/geo/crs/CRS.js#L110
          // const tileLatLng = this._map.unproject(tilePoint, zoom)
          // FIXME: this is just slightly off... wahhh
          const tileLatLng = this._map.layerPointToLatLng(tilePoint)

          console.log('[leaflet.offline] --- analyzing tile [unproject, layerPointToLatLng]', this._map.unproject(tilePoint, zoom), this._map.layerPointToLatLng(tilePoint))

          // TODO: aim towards this
          // @see https://github.com/Leaflet/Leaflet/blob/61ff641951fa64ba4730f71526988d99598681c8/src/layer/GeoJSON.js#L290
          // const tileLatLng = L.geoJSON.latLngToCoords(
          const tileGeo = { type: "Point", coordinates: [tileLatLng.lng, tileLatLng.lat] }

          console.log(`[leaflet.offline] ---- testing point against shape [zoom: ${zoom}, point, latlng, shape]`, tilePoint, tileLatLng, shape)
          console.log('[leaflet.offline] -------- tile geo', tileGeo)

          // FIXME: this is never matching because we are losing accuracy during `unprojct` (severe) and `layerPointToLatLng` (less)
          //  - might need to convert the lat/lng coords in the original shapes to x/y coords
          if (geoUtils.pointInPolygon(tileGeo, shape)) {
            console.log('[leaflet.offline] !!!!! added tile point (in shape!)', tilePoint)
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
