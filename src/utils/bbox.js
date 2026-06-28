function createEmptyBBox() {
  return {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
}

function expandBBox(bbox, x, y) {
  if (x < bbox.minX) bbox.minX = x;
  if (y < bbox.minY) bbox.minY = y;
  if (x > bbox.maxX) bbox.maxX = x;
  if (y > bbox.maxY) bbox.maxY = y;
}

function bboxIntersectsPoint(bbox, point) {
  return (
    point.longitude >= bbox.minX &&
    point.longitude <= bbox.maxX &&
    point.latitude >= bbox.minY &&
    point.latitude <= bbox.maxY
  );
}

module.exports = {
  createEmptyBBox,
  expandBBox,
  bboxIntersectsPoint,
};
