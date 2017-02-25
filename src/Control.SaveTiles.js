/* global L */
var localforage = require('./localforage');
/**
 * inspired by control.zoom
 * options are position (string), saveText (string) ,rmText (string), confirm (function)
 */

L.Control.SaveTiles = L.Control.extend({
	options: {
		position: 'topleft',
		saveText: '+',
		rmText: '-',
        // optional function called before saving tiles
		'confirm': null
	},
	// save dl and save status
	status: {
		'storagesize': null,
		'lengthToBeSaved': null,
		'lengthSaved': null,
		'lengthLoaded': null,
		'_tilesforSave': null
	},
	initialize: function (baseLayer, options) {
		this._baseLayer = baseLayer;
		this.setStorageSize();
		L.setOptions(this, options);
	},
	/**
	 * [setStorageSize description]
	 * @param {Function} callback [description]
	 */
	setStorageSize: function (callback) {
		var self = this;
		if (this.status.storagesize) {
			callback(this.status.storagesize);
			return;
		}
		localforage.length().then(function (numberOfKeys) {
			self.status.storagesize = numberOfKeys;
			self._baseLayer.fire('storagesize', self.status);
			if (callback) {
				callback(numberOfKeys);
			}
		});
	},
	/**
	 * [getStorageSize description]
	 * @param  {Function} callback [description]
	 */
	getStorageSize: function (callback) {
		this.setStorageSize(callback);
	},
	/**
	 * [setLayer description]
	 * @param {Object} layer [description]
	 */
	setLayer: function (layer) {
		this._baseLayer = layer;
	},
	onAdd: function () {
		var container = L.DomUtil.create('div', 'savetiles leaflet-bar'),
		options = this.options;
		this._createButton(options.saveText, 'Save tiles', 'savetiles', container, this._saveTiles);
		this._createButton(options.rmText, 'Remove tiles', 'rmtiles', container, this._rmTiles);
		return container;
	},
	_createButton: function (html, title, className, container, fn) {
		var link = L.DomUtil.create('a', className, container);
		link.innerHTML = html;
		link.href = '#';
		link.title = title;

		L.DomEvent
                .on(link, 'mousedown dblclick', L.DomEvent.stopPropagation)
                .on(link, 'click', L.DomEvent.stop)
                .on(link, 'click', fn, this)
                .on(link, 'click', this._refocusOnMap, this);
        // TODO enable disable on layer change map

		return link;
	},
	_saveTiles: function () {
		var bounds;
		var self = this;
		var tiles = [];
		// current zoom or zoom options
		var zoomlevels = this.options.zoomlevels || [this._map.getZoom()];
		var latlngBounds = this._map.getBounds();
		for (var i in zoomlevels) {
			bounds = L.bounds(this._map.project(latlngBounds.getNorthWest(), zoomlevels[i]),
				this._map.project(latlngBounds.getSouthEast(), zoomlevels[i]));
			tiles = tiles.concat(this._baseLayer.getTileUrls(bounds, zoomlevels[i]));
		}
		this._resetStatus(tiles);
		var succescallback = function () {
			self._baseLayer.fire('savestart', self.status);
			var subdlength = self._baseLayer.getSimultaneous();
			for (var i = 0; i < subdlength; i++) {
				self._loadTile(self.status._tilesforSave.shift());
			}
		};
		if (this.options.confirm) {
			this.options.confirm(this.status, succescallback);
		} else {
			succescallback();
		}
	},
	_resetStatus: function (tiles) {
		this.status = {
			lengthLoaded: 0,
			lengthToBeSaved: tiles.length,
			lengthSaved: 0,
			_tilesforSave: tiles
		};
	},
    /**
     * Download tile blob and save function after download
     * TODO, call with array of urls and download them all at once using fetch
     * TODO, call loadend only once
     * @param  {string} tileUrl
     * @return {void}
     */
	_loadTile: function (tileUrl) {
		var self = this;
		var xhr = new XMLHttpRequest();
		xhr.open('GET', tileUrl.url);
		xhr.responseType = 'blob';
		xhr.send();
		xhr.onreadystatechange = function () {
			if (this.readyState === 4 && this.status === 200) {
				self.status.lengthLoaded++;
				self._saveTile(tileUrl.key, this.response);
				if (self.status._tilesforSave.length > 0) {
					self._loadTile(self.status._tilesforSave.shift());
					self._baseLayer.fire('loadtileend', self.status);
				} else {
					self._baseLayer.fire('loadtileend', self.status);
					if (self.status.lengthLoaded === self.status.lengthToBeSaved) {
						self._baseLayer.fire('loadend', self.status);
					}
				}
			}
		};
	},
	/**
	 * [_saveTile description]
	 * @param  {string} tileUrl save key
	 * @param  {blob} blob    [description]
	 * @return {void}         [description]
	 */
	_saveTile: function (tileUrl, blob) {
		var self = this;
		localforage.removeItem(tileUrl).then(function () {
			localforage.setItem(tileUrl, blob).then(function () {
				self.status.lengthSaved++;
				self._baseLayer.fire('savetileend', self.status);
				if (self.status.lengthSaved === self.status.lengthToBeSaved) {
					self._baseLayer.fire('saveend', self.status);
					self.setStorageSize();
				}
			}).catch(function (err) {
				throw new Error(err);
			});
		}).catch(function (err) {
			throw new Error(err);
		});
	},
	_rmTiles: function () {
		var self = this;
		localforage.clear().then(function () {
			self.status.storagesize = 0;
			self._baseLayer.fire('tilesremoved');
			self._baseLayer.fire('storagesize', self.status);
		});
	}
});

L.control.savetiles = function (baseLayer, options) {
	return new L.Control.SaveTiles(baseLayer, options);
};
