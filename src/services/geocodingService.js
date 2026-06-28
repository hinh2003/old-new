class GeocodingService {
  constructor({ photonBaseUrl, logger }) {
    this.photonBaseUrl = photonBaseUrl;
    this.logger = logger || console;
    this.cache = new Map();
  }

  normalizeQuery(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  scoreResult(result, query) {
    const haystack = String(
      [
        result.display_name,
        result.name,
        result.class,
        result.type,
        result.address?.village,
        result.address?.hamlet,
        result.address?.suburb,
        result.address?.town,
        result.address?.city,
        result.address?.county,
        result.address?.state,
        result.address?.country,
      ]
        .filter(Boolean)
        .join(" ")
    )
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    const normalizedQuery = String(query)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    let score = 0;

    if (haystack.includes(normalizedQuery)) {
      score += 80;
    }

    if (result.class === "boundary" && result.type === "administrative") {
      score += 60;
    }

    if (["village", "hamlet", "neighbourhood", "suburb", "city", "town", "county"].includes(result.type)) {
      score += 30;
    }

    if (result.class === "place") {
      score += 10;
    }

    if (result.class === "tourism" || result.class === "amenity") {
      score -= 30;
    }

    return score;
  }

  async geocode(query) {
    const normalizedQuery = this.normalizeQuery(query);
    if (!normalizedQuery) {
      throw new Error("Address is required for geocoding.");
    }

    if (this.cache.has(normalizedQuery)) {
      return this.cache.get(normalizedQuery);
    }

    const searchQuery = /vietnam|viet nam|viá»‡t nam/i.test(normalizedQuery)
      ? normalizedQuery
      : `${normalizedQuery}, Vietnam`;

    this.logger.info("geocode request", {
      provider: "photon",
      query: normalizedQuery,
    });

    const match = await this.geocodeWithPhoton(searchQuery, normalizedQuery);
    this.cache.set(normalizedQuery, match);
    return match;
  }

  async geocodeWithPhoton(searchQuery, normalizedQuery) {
    const url = new URL("/api", this.photonBaseUrl);
    url.searchParams.set("q", searchQuery);
    url.searchParams.set("limit", "5");
    url.searchParams.set("lang", "default");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const responseBody = await response.text();
      this.logger.warn("photon http error", {
        provider: "photon",
        query: searchQuery,
        endpoint: "/api",
        url: url.toString(),
        status: response.status,
        response_body: responseBody.slice(0, 300),
      });
      return null;
    }

    const data = await response.json();
    const features = Array.isArray(data?.features) ? data.features : [];
    if (features.length === 0) {
      this.logger.warn("geocode no result", {
        provider: "photon",
        query: normalizedQuery,
        endpoint: "/api",
        url: url.toString(),
        result_count: features.length,
      });
      return null;
    }

    let bestMatch = null;
    for (const feature of features) {
      const coordinates = feature.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        continue;
      }

      const [longitude, latitude] = coordinates;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        continue;
      }

      const score = this.scoreResult(
        {
          display_name: feature.properties?.name || feature.properties?.street || searchQuery,
          name: feature.properties?.name,
          class: feature.properties?.osm_value || feature.properties?.type,
          type: feature.properties?.type,
          address: {
            village: feature.properties?.city,
            hamlet: feature.properties?.locality,
            suburb: feature.properties?.district,
            town: feature.properties?.city,
            city: feature.properties?.city,
            county: feature.properties?.county,
            state: feature.properties?.state,
            country: feature.properties?.country,
          },
        },
        searchQuery
      );

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          latitude,
          longitude,
          provider: "photon",
          display_name: feature.properties?.name || searchQuery,
          raw: feature,
          query: searchQuery,
          score,
        };
      }
    }

    if (bestMatch) {
      this.logger.info("geocode resolved", {
        provider: bestMatch.provider,
        query: normalizedQuery,
        resolved_query: bestMatch.query,
        latitude: bestMatch.latitude,
        longitude: bestMatch.longitude,
        display_name: bestMatch.display_name,
      });
    }

    return bestMatch;
  }
}

module.exports = {
  GeocodingService,
};
