import turf from '@turf/turf'

export function coordsIntersectPolygon (coords, shape) {
  console.log('--- detecting coord intersection', coords)
	const point = turf.point(coords)

  // console.log('------ coord as point', point)

	return turf.inside(point, shape)
}

// TODO: support Point, LineString
// FIXME: frankenstein code, improve (replace with `Array.prototype.any`)
export function polygonsIntersect (shape1, shape2) {
  let result = []

  if (shape1.type == 'Polygon' || shape1.type == 'MultiLineString') {
    result = shape1.coordinates.reduce((dump, part) => {
      return dump.concat(part.reduce((dump, coord) => {
        return coordsIntersectPolygon(coord, shape2)
      }))
    }, [])
  } else if (shape1.type == 'MultiPolygon') {
    result = shape1.coordinates.reduce((dump, poly) => {
      return dump.concat(poly.reduce((points, part) => {
        return coordsIntersectPolygon(part, shape2)
      }, []))
    }, [])
  } else if (shape1.type == 'Feature') {
		result = polygonsIntersect(shape1.geometry, shape2)
  } else if (shape1.type == 'GeometryCollection') {
    result = shape1.geometries.reduce((dump, g) => {
			return dump.concat(polygonsIntersect(g, shape2))
    }, [])
  } else if (shape1.type == 'FeatureCollection') {
    result = shape1.features.reduce((dump, f) => {
			return dump.concat(polygonsIntersect(f, shape2))
    }, [])
		// TODO: determine if `any` element of the dump is `true`
  }

  // console.log('util results', result[0])

  return result[0]
}

// --- REMOVE BELOW (it works but only for polygons and multi-polygons)

export function polyIntersectsWithMultiPoly (poly, multiPoly) {
  let intersects = false

  poly.coordinates.forEach(coord1 => {
    coord1.forEach(coord2 => {
      const polyPoint = turf.point(coord2)

      if (turf.inside(polyPoint, multiPoly) && !intersects) {
        intersects = true
      }
    })
  })

  return intersects
}

// --- NEW

export function shapesIntersect (shape1, shape2) {
  if (shape1.type == 'Polygon' || shape1.type == 'MultiLineString') {
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
