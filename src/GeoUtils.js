import turf from '@turf/turf'

export function coordsIntersectPolygon (coords, shape) {
  console.log('--- detecting coord intersection', coords)
	const point = turf.point(coords)

	return turf.inside(point, shape)
}

// TODO: support Point, LineString
// FIXME: frankenstein code, improve (replace with `Array.prototype.any`)
export function polygonsIntersect (shape1, shape2) {
  let results = []

  if (shape1.type == 'Polygon' || shape1.type == 'MultiLineString') {
    results = shape1.coordinates.reduce((dump, part) => {
      return dump.concat(part.reduce((dump, coord) => {
        return coordsIntersectPolygon(coord, shape2)
      }))
    }, [])
  } else if (shape1.type == 'MultiPolygon') {
    results = shape1.coordinates.reduce((dump, poly) => {
      return dump.concat(poly.reduce((points, part) => {
        return coordsIntersectPolygon(part, shape2)
      }, []))
    }, [])
  } else if (shape1.type == 'Feature') {
		results = polygonsIntersect(shape1.geometry, shape2)
  } else if (shape1.type == 'GeometryCollection') {
    results = shape1.geometries.reduce((dump, g) => {
			return dump.concat(polygonsIntersect(g, shape2))
    }, [])
  } else if (shape1.type == 'FeatureCollection') {
    results = shape1.features.reduce((dump, f) => {
			return dump.concat(polygonsIntersect(f, shape2))
    }, [])
		// TODO: determine if `any` element of the dump is `true`
  }

  console.log('util results', results[0])

  return results[0]
}
