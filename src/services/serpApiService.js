class SerpApiService {
  constructor({ apiKey, baseUrl, googleDomain, gl, hl, ll, logger }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.googleDomain = googleDomain;
    this.gl = gl;
    this.hl = hl;
    this.ll = ll;
    this.logger = logger || console;
    this.cache = new Map();
  }

  normalizeQuery(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  buildUrl(engine, params = {}) {
    const url = new URL("/search.json", this.baseUrl);
    url.searchParams.set("engine", engine);
    url.searchParams.set("api_key", this.apiKey);

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }

    return url;
  }

  async requestJson(url, context) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.warn("serpapi http error", {
        ...context,
        url: url.toString(),
        status: response.status,
        response_body: body.slice(0, 300),
      });
      return null;
    }

    return response.json();
  }

  async autocomplete(query) {
    const normalizedQuery = this.normalizeQuery(query);
    if (!normalizedQuery) return [];

    const cacheKey = `autocomplete:${normalizedQuery}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (!this.apiKey) {
      this.logger.warn("serpapi api key missing", {
        provider: "serpapi",
        query: normalizedQuery,
      });
      return [];
    }

    const url = this.buildUrl("google_maps_autocomplete", {
      q: normalizedQuery,
      gl: this.gl,
      hl: this.hl,
      ll: this.ll,
    });

    const data = await this.requestJson(url, {
      provider: "serpapi",
      engine: "google_maps_autocomplete",
      query: normalizedQuery,
    });

    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
    const normalized = suggestions
      .map((item, index) => ({
        id: item.data_id || item.place_id || `${index}`,
        value: item.value || "",
        subtext: item.subtext || "",
        type: item.type || "",
        latitude: Number.isFinite(item.latitude) ? item.latitude : null,
        longitude: Number.isFinite(item.longitude) ? item.longitude : null,
        data_id: item.data_id || "",
        place_id: item.place_id || "",
        serpapi_link: item.serpapi_link || "",
        maps_serpapi_link: item.maps_serpapi_link || "",
      }))
      .filter((item) => item.value);

    this.cache.set(cacheKey, normalized);
    return normalized;
  }

  async geocode(query) {
    const normalizedQuery = this.normalizeQuery(query);
    if (!normalizedQuery) return null;

    const cacheKey = `resolve:${normalizedQuery}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (!this.apiKey) {
      this.logger.warn("serpapi api key missing", {
        provider: "serpapi",
        query: normalizedQuery,
      });
      return null;
    }

    const searchQuery = /vietnam|viet nam|việt nam/i.test(normalizedQuery)
      ? normalizedQuery
      : `${normalizedQuery}, Vietnam`;

    const url = this.buildUrl("google_maps", {
      q: searchQuery,
      type: "search",
      google_domain: this.googleDomain,
      gl: this.gl,
      hl: this.hl,
      ll: this.ll,
    });

    const data = await this.requestJson(url, {
      provider: "serpapi",
      engine: "google_maps",
      query: normalizedQuery,
    });

    const localResults = Array.isArray(data?.local_results) ? data.local_results : [];
    const placeResults = Array.isArray(data?.place_results) ? data.place_results : [];
    const results = localResults.length > 0 ? localResults : placeResults;

    if (results.length === 0) {
      this.logger.warn("serpapi no result", {
        provider: "serpapi",
        engine: "google_maps",
        query: normalizedQuery,
        status: data?.search_information?.local_results_state || "UNKNOWN",
      });
      return null;
    }

    const best =
      results.find(
        (item) =>
          Number.isFinite(item?.gps_coordinates?.latitude) &&
          Number.isFinite(item?.gps_coordinates?.longitude)
      ) || results[0];

    const coords = best?.gps_coordinates || {};
    if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
      return null;
    }

    const match = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      provider: "serpapi",
      display_name: best.title || searchQuery,
      query: searchQuery,
      raw: best,
      search_metadata: data?.search_metadata || null,
    };

    this.cache.set(cacheKey, match);
    return match;
  }
}

module.exports = {
  SerpApiService,
};
