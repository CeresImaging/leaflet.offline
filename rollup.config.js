import buble from 'rollup-plugin-buble';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/bundle.js',
    format: 'umd',
    name: 'LeafletOffline',
  },
  plugins: [buble()],
  external: [
    'leaflet',
    'localforage',
    'geojson-bbox',
    '@mapbox/tilebelt',
    '@turf/boolean-point-in-polygon',
    'turf-point'
  ],
  globals: {
    leaflet: 'L',
    localforage: 'localforage'
  }
};
