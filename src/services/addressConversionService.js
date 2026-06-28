const {
  buildAddressWithAdministrativeTail,
} = require("../utils/addressFormatter");

class AddressConversionService {
  constructor({ targetRepository, geocodingService, logger }) {
    this.targetRepository = targetRepository;
    this.geocodingService = geocodingService;
    this.logger = logger || console;
  }

  async convert({ formatted_address, latitude, longitude }) {
    this.logger.info("convert request", {
      formatted_address,
      has_latitude: Number.isFinite(latitude),
      has_longitude: Number.isFinite(longitude),
    });

    let resolvedLatitude = latitude;
    let resolvedLongitude = longitude;
    let geocoded = null;

    if (!Number.isFinite(resolvedLatitude) || !Number.isFinite(resolvedLongitude)) {
      this.logger.info("convert geocoding fallback", {
        formatted_address,
      });

      geocoded = await this.geocodingService.geocode(formatted_address);

      if (!geocoded) {
        this.logger.warn("convert geocoding failed", {
          formatted_address,
        });
        return {
          success: false,
          message: "Could not geocode the provided address.",
        };
      }

      resolvedLatitude = geocoded.latitude;
      resolvedLongitude = geocoded.longitude;
    }

    const matchedFeature = this.targetRepository.findContainingFeature({
      latitude: resolvedLatitude,
      longitude: resolvedLongitude,
    });

    if (!matchedFeature) {
      this.logger.warn("convert no boundary match", {
        formatted_address,
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
        geocoded,
      });
      return {
        success: false,
        message: "Coordinate is outside all old administrative boundaries.",
        geocoded_coordinates: geocoded
          ? {
              latitude: geocoded.latitude,
              longitude: geocoded.longitude,
              provider: geocoded.provider,
              display_name: geocoded.display_name,
              query: geocoded.query,
            }
          : null,
      };
    }

    const administrative = matchedFeature.administrative;
    const convertedAddress = buildAddressWithAdministrativeTail(
      formatted_address,
      administrative
    );

    this.logger.info("convert boundary matched", {
      formatted_address,
      latitude: resolvedLatitude,
      longitude: resolvedLongitude,
      feature_id: matchedFeature.featureId,
      province: administrative.province,
      district: administrative.district,
      ward: administrative.ward,
    });

    return {
      success: true,
      original_address: formatted_address,
      converted_address: convertedAddress,
      old_address: convertedAddress,
      old_administrative: administrative,
      converted_administrative: administrative,
      input_coordinates: {
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
      },
      geocoded_coordinates: geocoded
        ? {
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
            provider: geocoded.provider,
            display_name: geocoded.display_name,
            query: geocoded.query,
          }
        : null,
      matched_feature: {
        feature_id: matchedFeature.featureId,
        province: administrative.province,
        district: administrative.district,
        ward: administrative.ward,
      },
      source_administrative_system: "new",
      target_administrative_system: "old",
    };
  }
}

module.exports = {
  AddressConversionService,
};
