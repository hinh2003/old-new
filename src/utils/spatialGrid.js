function gridKey(x, y) {
  return `${x}:${y}`;
}

function buildSpatialGrid(features, gridSize) {
  const index = new Map();

  features.forEach((feature, featureIndex) => {
    const { bbox } = feature;
    const minCellX = Math.floor(bbox.minX / gridSize);
    const maxCellX = Math.floor(bbox.maxX / gridSize);
    const minCellY = Math.floor(bbox.minY / gridSize);
    const maxCellY = Math.floor(bbox.maxY / gridSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const key = gridKey(cellX, cellY);
        if (!index.has(key)) {
          index.set(key, []);
        }
        index.get(key).push(featureIndex);
      }
    }
  });

  return index;
}

function getGridCell(longitude, latitude, gridSize) {
  return {
    cellX: Math.floor(longitude / gridSize),
    cellY: Math.floor(latitude / gridSize),
  };
}

function getCandidateIndices(gridIndex, longitude, latitude, gridSize) {
  const { cellX, cellY } = getGridCell(longitude, latitude, gridSize);
  const candidates = new Set();

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const key = gridKey(cellX + dx, cellY + dy);
      const bucket = gridIndex.get(key);
      if (!bucket) continue;
      for (const featureIndex of bucket) {
        candidates.add(featureIndex);
      }
    }
  }

  return [...candidates].sort((a, b) => a - b);
}

module.exports = {
  buildSpatialGrid,
  getCandidateIndices,
};
