const express = require("express");
const cors = require("cors");
const path = require("path");

const { BoundaryRepository } = require("./services/boundaryRepository");
const { AddressConversionService } = require("./services/addressConversionService");
const { GeocodingService } = require("./services/geocodingService");
const { createLogger } = require("./utils/logger");
const {
  oldBoundariesPath,
  gridSize,
  photonBaseUrl,
} = require("./config");

function createApp() {
  const app = express();
  const logger = createLogger("convert-address");
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  const boundaryRepository = new BoundaryRepository({
    oldBoundariesPath,
    gridSize,
  }).load();

  const geocodingService = new GeocodingService({
    photonBaseUrl,
    logger,
  });

  const conversionService = new AddressConversionService(
    {
      targetRepository: boundaryRepository,
      geocodingService,
      logger,
    }
  );

  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  app.get("/health", (_req, res) => {
    res.json({
      success: true,
      status: "ok",
      loaded_features: boundaryRepository.features.length,
      geocoding_provider: "photon",
    });
  });

  app.get("/api/meta", (_req, res) => {
    res.json({
      success: true,
      boundaries: {
        loaded_features: boundaryRepository.features.length,
      },
      grid_size: gridSize,
      geocoding_provider: "photon",
      photon_base_url: photonBaseUrl,
    });
  });

  app.get("/api/old-boundaries.geojson", (_req, res) => {
    res.json(boundaryRepository.getRawGeoJson());
  });

  app.post("/convert-address", async (req, res) => {
    const { formatted_address, latitude, longitude } = req.body || {};

    if (typeof formatted_address !== "string" || !formatted_address.trim()) {
      return res.status(400).json({
        success: false,
        message: "formatted_address is required.",
      });
    }

    logger.info("api request received", {
      formatted_address: formatted_address.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
    });

    try {
      const result = await conversionService.convert({
        formatted_address: formatted_address.trim(),
        latitude:
          latitude === undefined || latitude === null || latitude === ""
            ? null
            : Number(latitude),
        longitude:
          longitude === undefined || longitude === null || longitude === ""
            ? null
            : Number(longitude),
      });

      if (!result.success) {
        logger.warn("api request failed", {
          formatted_address: formatted_address.trim(),
          message: result.message,
        });
        return res.status(404).json(result);
      }

      logger.info("api request success", {
        formatted_address: formatted_address.trim(),
        converted_address: result.converted_address,
      });

      return res.json(result);
    } catch (error) {
      logger.error("api request error", {
        formatted_address: formatted_address.trim(),
        error: error.message || String(error),
      });
      return res.status(500).json({
        success: false,
        message: error.message || "Unexpected error during conversion.",
      });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      message: "Route not found.",
    });
  });

  return app;
}

module.exports = {
  createApp,
};
