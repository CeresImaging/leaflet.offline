import L from 'leaflet';
import localforage from './localforage';
import geoBox from 'geojson-bbox';
import { tileToGeoJSON } from '@mapbox/tilebelt';
import { polygonsIntersect } from './GeoUtils';

// https://codepen.io/slurmulon/pen/zRVzjX
//

// REMOVE ME (for testing)

// --------------------------- START

function createPolygonFromBounds (latLngBounds, map) {
  const center = latLngBounds.getCenter()
  const latlngs = []

  latlngs.push(latLngBounds.getSouthWest()) // bottom left
  latlngs.push({ lat: latLngBounds.getSouth(), lng: center.lng }) // bottom center
  latlngs.push(latLngBounds.getSouthEast()) // bottom right
  latlngs.push({ lat: center.lat, lng: latLngBounds.getEast() }) // center right
  latlngs.push(latLngBounds.getNorthEast()) // top right
  latlngs.push({ lat: latLngBounds.getNorth(), lng: map.getCenter().lng }) // top center
  latlngs.push(latLngBounds.getNorthWest()) // top left
  latlngs.push({ lat: map.getCenter().lat, lng: latLngBounds.getWest() }) // center left

  return new L.polygon(latlngs)
}

// ---

// var d2r = Math.PI / 180,
//   r2d = 180 / Math.PI;

// /**
//  * Get the bbox of a tile
//  *
//  * @name tileToBBOX
//  * @param {Array<number>} tile
//  * @returns {Array<number>} bbox
//  * @example
//  * var bbox = tileToBBOX([5, 10, 10])
//  * //=bbox
//  */
// function tileToBBOX(tile) {
//   var e = tile2lon(tile[0] + 1, tile[2]);
//   var w = tile2lon(tile[0], tile[2]);
//   var s = tile2lat(tile[1] + 1, tile[2]);
//   var n = tile2lat(tile[1], tile[2]);
//   return [w, s, e, n];
// }

// /**
//  * Get a geojson representation of a tile
//  *
//  * @name tileToGeoJSON
//  * @param {Array<number>} tile
//  * @returns {Feature<Polygon>}
//  * @example
//  * var poly = tileToGeoJSON([5, 10, 10])
//  * //=poly
//  */
// function tileToGeoJSON(tile) {
//   var bbox = tileToBBOX(tile);
//   var poly = {
//     type: 'Polygon',
//     coordinates: [[
//       [bbox[0], bbox[1]],
//       [bbox[0], bbox[3]],
//       [bbox[2], bbox[3]],
//       [bbox[2], bbox[1]],
//       [bbox[0], bbox[1]]
//     ]]
//   };
//   return poly;
// }

// function tile2lon(x, z) {
//   return x / Math.pow(2, z) * 360 - 180;
// }

// function tile2lat(y, z) {
//   var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
//   return r2d * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
// }

// END -----------------------------


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
    const geometries = shapes instanceof Array ? shapes : [shapes]

    this.setUrl(this._url.replace('{z}', zoom), true)

    geometries.forEach(shape => {
      // --- start

      const boundCoords  = geoBox(shape)
      const boundLatLngs = new L.latLngBounds(L.GeoJSON.coordsToLatLngs([[boundCoords[0], boundCoords[1]], [boundCoords[2], boundCoords[3]]]))
      const boundShape = createPolygonFromBounds(boundLatLngs, this._map).setStyle({ color: 'yellow' })

      const pointBounds = L.bounds(
        this._map.project(boundLatLngs.getNorthWest(), zoom),
        this._map.project(boundLatLngs.getSouthEast(), zoom)
      )

      // --- end

      // NOTE: these values match the Codepen (correct)
      const tileBounds = L.bounds(
        pointBounds.min.divideBy(this.getTileSize().x).floor(),
        pointBounds.max.divideBy(this.getTileSize().x).floor()
      )

      console.log('@@@ tile bounds', tileBounds)

      let url

      boundShape.addTo(this._map)

      for (let j = tileBounds.min.y; j <= tileBounds.max.y; j += 1) {
        for (let i = tileBounds.min.x; i <= tileBounds.max.x; i += 1) {
          // FIXME: tilePoint `x` and `y` are slightly off
          //  - actually at second glance these values are okay. even the resulting lat/lng looks fine...?
          const tilePoint = new L.Point(i, j)
          const tileShape = tileToGeoJSON([tilePoint.x, tilePoint.y, zoom]) // FIXME: the 0th element of each coordinate Array is off here. 1st element is fine.
          const tileIntersects = polygonsIntersect(tileShape, shape)

          console.log('\n--- tile point', tilePoint)
          console.log('--- tile x/y (orig)', i, j)
          console.log('--- tile shape', tileShape)

          if (tileIntersects) {
            // console.log('[leaflet.offline] added tile point (in shape!)', tilePoint)
            // console.log('[leaflet.offline] added tile shape', tileShape)

            L.geoJSON(tileShape, { style: { color: 'orange' } }).addTo(this._map)

            url = L.TileLayer.prototype.getTileUrl.call(this, tilePoint)

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
L.tileLayer.offline = (url, options) => new TileLayerOffline(url, options);
