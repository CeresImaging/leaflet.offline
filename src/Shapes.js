import turfPoint from 'turf-point'
import isPointInPolygon from '@turf/boolean-point-in-polygon'

/**
 * Determines if a set of coordinates reside within a GeoJSON shape
 */
export function coordsIntersectPolygon (coords, shape) {
  const point = turfPoint(coords)

  console.log('[leaflet.offline] ~~~ coords in shape?', coords, shape, isPointInPolygon(point, shape))

  return isPointInPolygon(point, shape) || isPointInPolygon(shape, point)
}

/**
 * Determines if two GeoJSON shapes intersect
 */
export function shapesIntersect (shape1, shape2) {
  if (shape1.type == 'Point') {
    return coordsIntersectPolygon(shape1.coordinates, shape2)
  } else if (shape1.type == 'Polygon' || shape1.type == 'MultiLineString') {
    return shape1.coordinates.some(coord1 => {
      return coord1.some(coord2 => {
        return coordsIntersectPolygon(coord2, shape2)
      })
    })
  } else if (shape1.type == 'MultiPolygon') {
    return shape1.coordinates.some(coord1 => {
      return coord1.some(coord2 => {
        return coord2.some(coord3 => {
          return coordsIntersectPolygon(coord3, shape2)
        })
      })
    })
  } else if (shape1.type == 'Feature') {
    return shapesIntersect(shape1.geometry, shape2)
  } else if (shape1.type == 'GeometryCollection') {
    return shape1.geometries.some(geometry => {
      return shapesIntersect(geometry, shape2)
    })
  } else if (shape1.type == 'FeatureCollection') {
    return shape1.features.some(feature => {
      return shapesIntersect(feature, shape2)
    })
  }

  return false
}
