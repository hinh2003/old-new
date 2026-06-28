const { createEmptyBBox, expandBBox } = require("./bbox");

const EPSILON = 1e-12;

function pointOnSegment(px, py, ax, ay, bx, by) {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (Math.abs(cross) > EPSILON) return false;

  const dot = (px - ax) * (px - bx) + (py - ay) * (py - by);
  return dot <= EPSILON;
}

function pointInRing(point, ring) {
  let inside = false;
  const x = point.longitude;
  const y = point.latitude;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (pointOnSegment(x, y, xi, yi, xj, yj)) {
      return true;
    }

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function polygonBBox(polygonCoordinates) {
  const bbox = createEmptyBBox();
  for (const ring of polygonCoordinates) {
    for (const [x, y] of ring) {
      expandBBox(bbox, x, y);
    }
  }
  return bbox;
}

function pointInPolygon(point, polygonCoordinates) {
  if (!polygonCoordinates || polygonCoordinates.length === 0) return false;

  if (!pointInRing(point, polygonCoordinates[0])) {
    return false;
  }

  for (let i = 1; i < polygonCoordinates.length; i += 1) {
    if (pointInRing(point, polygonCoordinates[i])) {
      return false;
    }
  }

  return true;
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;

  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    for (const polygonCoordinates of geometry.coordinates) {
      if (pointInPolygon(point, polygonCoordinates)) {
        return true;
      }
    }
    return false;
  }

  return false;
}

module.exports = {
  pointInRing,
  pointInPolygon,
  pointInGeometry,
  polygonBBox,
};
