const fs = require("fs");
const { createEmptyBBox, expandBBox } = require("../utils/bbox");
const { pointInGeometry } = require("../utils/pointInPolygon");
const { buildSpatialGrid, getCandidateIndices } = require("../utils/spatialGrid");

function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content);
}

function deriveAdministrativeNames(properties = {}) {
  const province =
    properties.ten_tinh ||
    properties.tenTinh ||
    properties.province ||
    null;
  const district =
    properties.ten_huyen ||
    properties.tenHuyen ||
    properties.district ||
    null;
  const ward =
    properties.ten_xa ||
    properties.tenXa ||
    properties.ward ||
    null;

  return {
    province,
    district,
    ward,
  };
}

function computeGeometryBBox(geometry) {
  const bbox = createEmptyBBox();

  const walk = (value) => {
    if (!Array.isArray(value)) return;

    if (typeof value[0] === "number" && typeof value[1] === "number") {
      expandBBox(bbox, value[0], value[1]);
      return;
    }

    for (const item of value) {
      walk(item);
    }
  };

  walk(geometry.coordinates);
  return bbox;
}

class BoundaryRepository {
  constructor({ oldBoundariesPath, gridSize }) {
    this.oldBoundariesPath = oldBoundariesPath;
    this.gridSize = gridSize;
    this.features = [];
    this.gridIndex = new Map();
    this.loaded = false;
  }

  load() {
    if (this.loaded) return this;

    const raw = readJsonFile(this.oldBoundariesPath);
    if (!raw || raw.type !== "FeatureCollection" || !Array.isArray(raw.features)) {
      throw new Error("Invalid GeoJSON file: expected a FeatureCollection.");
    }

    this.raw = raw;
    this.features = raw.features
      .filter((feature) => feature && feature.geometry)
      .map((feature, featureIndex) => {
        const bbox = computeGeometryBBox(feature.geometry);
        const administrative = deriveAdministrativeNames(feature.properties);

        return {
          featureIndex,
          featureId: feature.id ?? feature.properties?.ma_xa ?? String(featureIndex),
          geometry: feature.geometry,
          properties: feature.properties || {},
          bbox,
          administrative,
        };
      });

    this.gridIndex = buildSpatialGrid(this.features, this.gridSize);
    this.loaded = true;
    return this;
  }

  getRawGeoJson() {
    if (!this.loaded) {
      throw new Error("Boundary repository has not been loaded yet.");
    }

    return this.raw;
  }

  findContainingFeature({ latitude, longitude }) {
    const candidates = getCandidateIndices(
      this.gridIndex,
      longitude,
      latitude,
      this.gridSize
    );

    if (candidates.length === 0) {
      return null;
    }

    const point = { latitude, longitude };

    for (const candidateIndex of candidates) {
      const feature = this.features[candidateIndex];
      if (!feature) continue;

      if (
        longitude < feature.bbox.minX ||
        longitude > feature.bbox.maxX ||
        latitude < feature.bbox.minY ||
        latitude > feature.bbox.maxY
      ) {
        continue;
      }

      if (pointInGeometry(point, feature.geometry)) {
        return feature;
      }
    }

    return null;
  }
}

module.exports = {
  BoundaryRepository,
};
