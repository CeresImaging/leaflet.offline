import lf from 'localforage';

export default lf.createInstance({
  name: 'leaflet_offline',
  version: 1.0,
  size: 4980736,
  storeName: 'tiles',
  description: 'the tiles',
});
