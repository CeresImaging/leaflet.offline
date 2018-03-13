import turf from '@turf/turf'

export function coordsIntersectPolygon (coords, shape) {
	const point = turf.point(coords)

	return turf.inside(point, shape)
}

export function shapesIntersect (shape1, shape2) {
  if (shape1.type == 'Point') {
    return coordsIntersectPolygon(shape1.coordinates, shape2)
  } else if (shape1.type == 'Polygon' || shape1.type == 'MultiLineString') {
    return shape1.coordinates.find(coord1 => {
      return coord1.find(coord2 => {
        return coordsIntersectPolygon(coord2, shape2)
      })
    })
  } else if (shape1.type == 'MultiPolygon') {
    return shape1.coordinates.find(coord1 => {
      return coord1.find(coord2 => {
        return coord2.find(coord3 => {
          return coordsIntersect(coord3, shape2)
        })
      })
    })
  } else if (shape1.type == 'Feature') {
    return shapesIntersect(shape1.geometry, shape2)
  } else if (shape1.type == 'GeometryCollection') {
    return shape1.geometries.find(geometry => {
      return shapesIntersect(geometry, shape2)
    })
  } else if (shape1.type == 'FeatureCollection') {
    return shape1.features.find(feature => {
      return shapesIntersect(feature, shape2)
    })
  }

  return false
}
