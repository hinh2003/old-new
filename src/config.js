require("dotenv").config();

const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

module.exports = {
  port: Number(process.env.PORT || 3000),
  oldBoundariesPath:
    process.env.OLD_BOUNDARIES_PATH ||
    path.join(ROOT_DIR, "GeoJson", "truocsapnhap.geojson"),
  gridSize: Number(process.env.GRID_SIZE || 0.1),
  serpApiKey: process.env.SERPAPI_API_KEY || "",
  serpApiBaseUrl: process.env.SERPAPI_BASE_URL || "https://serpapi.com",
  serpApiGoogleDomain: process.env.SERPAPI_GOOGLE_DOMAIN || "google.com",
  serpApiGl: process.env.SERPAPI_GL || "vn",
  serpApiHl: process.env.SERPAPI_HL || "vi",
};
