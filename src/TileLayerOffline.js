import L from 'leaflet'
import localforage from './localforage'
import geoBox from 'geojson-bbox'
import { tileToGeoJSON } from '@mapbox/tilebelt'
import { shapesIntersect } from './Shapes'

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
  * @return {HTMLElement}      [description]
  */
  createTile (coords, done) {
    const tile = L.TileLayer.prototype.createTile.call(this, coords, done)
    const url = tile.src

    this.setDataUrl(tile, url).then((dataUrl) => {
      tile.src = dataUrl
    }).catch(() => {
      tile.src = url
    })

    return tile
  },

  /**
   * dataurl from localstorage
   * @param {DomElement} tile [description]
   * @param {string} url  [description]
   * @return {Promise} resolves to base64 url
   */
  setDataUrl (tile, url) {
    return new Promise((resolve, reject) => {
      localforage.getItem(this._getStorageKey(url)).then((data) => {
        if (data && typeof data === 'object') {
          resolve(URL.createObjectURL(data))
        } else {
          reject()
        }
      }).catch((e) => { reject(e) })
    })
  },

  /**
   * get key to use for storage
   * @private
   * @param  {string} url url used to load tile
   * @return {string} unique identifier.
   */
  _getStorageKey (url) {
    let key
    const subdomainpos = this._url.indexOf('{s}')

    if (subdomainpos > 0) {
      key = url.substring(0, subdomainpos) +
        this.options.subdomains['0'] +
        url.substring(subdomainpos + 1, url.length)
    }

    return key || url
  },

  /**
   * @return {number} Number of simultanous downloads from tile server
   */
  getSimultaneous () {
    return this.options.subdomains.length
  },

  /**
   * getTileUrls for single zoomlevel
   * @param  {object} L.latLngBounds
   * @param  {number} zoom
   * @return {object[]} the tile urls, key, url
   */
  getTileUrls (bounds, zoom) {
    const tiles = []
    const origurl = this._url

    // getTileUrl uses current zoomlevel, we want to overwrite it
    this.setUrl(this._url.replace('{z}', zoom), true)

    const pointBounds = L.bounds(
      this._map.project(bounds.getNorthWest(), zoom),
      this._map.project(bounds.getSouthEast(), zoom)
    )

    const tileBounds = L.bounds(
      pointBounds.min.divideBy(this.getTileSize().x).floor(),
      pointBounds.max.divideBy(this.getTileSize().x).floor()
    )

    for (let j = tileBounds.min.y; j <= tileBounds.max.y; j += 1) {
      for (let i = tileBounds.min.x; i <= tileBounds.max.x; i += 1) {
        const tilePoint = new L.Point(i, j)
        const url = L.TileLayer.prototype.getTileUrl.call(this, tilePoint)

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
   * Gets the tile URLs for a non-rectangular shape (GeoJSON) at the defined zoom level
   * @param  {GeoJSON} shapes
   * @param  {number} zoom
   * @return {object[]} the tile urls, key, url
   */
  getTileUrlsInShapes (shapes, zoom) {
    const tiles = []
    const origUrl = this._url
    const geometries = shapes instanceof Array ? shapes : [shapes]

    console.log('[leaflet.offline] getting tile urls for zoom level', zoom, geometries)

    this.setUrl(this._url.replace('{z}', zoom), true)

    geometries.forEach(shape => {
      L.geoJSON(shape, { style: { color: 'yellow' } }).addTo(this._map)

      const boundCoords = geoBox(shape)
      const boundLatLngs = new L.latLngBounds(L.GeoJSON.coordsToLatLngs([
        [boundCoords[0], boundCoords[1]],
        [boundCoords[2], boundCoords[3]]
      ]))

      const pointBounds = L.bounds(
        this._map.project(boundLatLngs.getNorthWest(), zoom),
        this._map.project(boundLatLngs.getSouthEast(), zoom)
      )

      const tileBounds = L.bounds(
        pointBounds.min.divideBy(this.getTileSize().x).floor(),
        pointBounds.max.divideBy(this.getTileSize().x).floor()
      )

      for (let j = tileBounds.min.y; j <= tileBounds.max.y; j += 1) {
        for (let i = tileBounds.min.x; i <= tileBounds.max.x; i += 1) {
          const tilePoint = new L.Point(i, j)
          const tileShape = tileToGeoJSON([tilePoint.x, tilePoint.y, zoom])
          // const tileIntersects = shapesIntersect(tileShape, shape)
          const tileIntersects = shapesIntersect(shape, tileShape)

          // L.geoJSON(tileShape, { style: { color: 'pink' } }).addTo(this._map)

          if (tileIntersects) {
            const url = L.TileLayer.prototype.getTileUrl.call(this, tilePoint)

            L.geoJSON(tileShape, { style: { color: 'teal' } }).addTo(this._map)

            tiles.push({
              key: this._getStorageKey(url),
              url,
            })
          }
        }
      }
    })

    // restore url
    this.setUrl(origUrl, true)

    console.log('[leaflet.offline] returning tiles for zoom level', zoom, tiles.length)

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
 * @param  {string} url [description]
 * @param  {object} options {@link http://leafletjs.com/reference-1.2.0.html#tilelayer}
 * @return {TileLayerOffline} an instance of TileLayerOffline
 */
L.tileLayer.offline = (url, options) => new TileLayerOffline(url, options)
