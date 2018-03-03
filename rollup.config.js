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
    'geojson-box',
    'geojson-utils'
  ],
  globals: {
    localforage: 'localforage',
    leaflet: 'L',
  },
};
