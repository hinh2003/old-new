require("dotenv").config();

const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

module.exports = {
  port: Number(process.env.PORT || 3000),
  oldBoundariesPath:
    process.env.OLD_BOUNDARIES_PATH ||
    path.join(ROOT_DIR, "GeoJson", "truocsapnhap.geojson"),
  gridSize: Number(process.env.GRID_SIZE || 0.1),
  photonBaseUrl: process.env.PHOTON_BASE_URL || "https://photon.komoot.io",
};
