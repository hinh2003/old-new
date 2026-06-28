class AddressParsingService {
  constructor({ client, model, logger }) {
    this.client = client;
    this.model = model;
    this.logger = logger || console;
  }

  normalizeInput(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  cleanText(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  compareText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  normalizeAdministrativeFields({ ward, district, province, country }) {
    let wardValue = this.cleanText(ward);
    let districtValue = this.cleanText(district);
    let provinceValue = this.cleanText(province);
    let countryValue = this.cleanText(country);
    const districtCompare = this.compareText(districtValue);
    const provinceCompare = this.compareText(provinceValue);

    const districtLikeProvince =
      /(city|thanh pho|tinh|province)/i.test(districtCompare);

    if (districtLikeProvince && !provinceValue) {
      provinceValue = districtValue;
      districtValue = "";
    } else if (districtLikeProvince) {
      districtValue = "";
    }

    if (/(city|thanh pho|tinh|province)/i.test(provinceCompare)) {
      provinceValue = provinceValue
        .replace(/^(tp|thanh pho|thành phố|tinh|tỉnh|province)\s+/i, "")
        .trim();
    }

    if (!countryValue && /vietnam|viet nam|việt nam/i.test(`${wardValue} ${districtValue} ${provinceValue}`)) {
      countryValue = "Vietnam";
    }

    return {
      ward: wardValue,
      district: districtValue,
      province: provinceValue,
      country: countryValue,
    };
  }

  async parse(formattedAddress) {
    const input = this.normalizeInput(formattedAddress);
    if (!input) {
      throw new Error("formatted_address is required for parsing.");
    }

    if (!this.client) {
      this.logger.warn("openai client missing, using rule-based parser", {
        formatted_address: input,
      });
      return this.ruleBasedParse(input);
    }

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        detail: { type: "string" },
        ward: { type: "string" },
        district: { type: "string" },
        province: { type: "string" },
        country: { type: "string" },
        geocoding_query: { type: "string" },
        normalized_address: { type: "string" },
        confidence: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
      },
      required: [
        "detail",
        "ward",
        "district",
        "province",
        "country",
        "geocoding_query",
        "normalized_address",
        "confidence",
      ],
    };

    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: "system",
            content:
              "You extract Vietnamese address components for geocoding. Do not fabricate facts. Use the raw input, preserve the detail part, and only infer administrative components when they are strongly implied. If unsure, leave the field empty. The geocoding query should prioritize administrative components first (ward, district, province) and should avoid using the detail part unless it is necessary. Prefer canonical Vietnamese names when obvious from the text.",
          },
          {
            role: "user",
            content: `Parse this address: ${input}`,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "address_parse",
            strict: true,
            schema,
          },
        },
      });

      const rawText = response.output_text || "";
      const parsed = JSON.parse(rawText);
      const normalized = this.normalizeParsed(parsed, input);

      this.logger.info("openai address parse success", {
        formatted_address: input,
        confidence: normalized.confidence,
        geocoding_query: normalized.geocoding_query,
      });

      return normalized;
    } catch (error) {
      this.logger.warn("openai address parse failed, using fallback", {
        formatted_address: input,
        error: error.message || String(error),
      });
      return this.ruleBasedParse(input);
    }
  }

  normalizeParsed(parsed, fallbackInput) {
    const clean = (value) => this.cleanText(value);
    const admin = this.normalizeAdministrativeFields({
      ward: parsed.ward,
      district: parsed.district,
      province: parsed.province,
      country: parsed.country,
    });
    const result = {
      raw_input: fallbackInput,
      detail: clean(parsed.detail),
      ward: admin.ward,
      district: admin.district,
      province: admin.province,
      country: admin.country,
      geocoding_query: "",
      normalized_address: clean(parsed.normalized_address) || fallbackInput,
      confidence: ["low", "medium", "high"].includes(parsed.confidence)
        ? parsed.confidence
        : "medium",
      source: "openai",
    };

    result.geocoding_query = this.buildRuleBasedQuery(result, fallbackInput);

    return result;
  }

  ruleBasedParse(input) {
    const parts = input
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    const detail = parts[0] || input;
    const ward =
      parts.find((part) =>
        /(\bxa\b|\bxã\b|\bphuong\b|\bphường\b|\bcommune\b|\bward\b)/i.test(part)
      ) || "";
    const district =
      parts.find((part) => /(\bhuyen\b|\bhuyện\b|\bdistrict\b)/i.test(part)) ||
      "";
    const province =
      parts.find((part) =>
        /(\btinh\b|\btỉnh\b|\bcity\b|\bthanh pho\b|\bthành phố\b|\btp\b)/i.test(part)
      ) || "";

    const admin = this.normalizeAdministrativeFields({
      ward,
      district,
      province,
      country: /vietnam|viet nam|việt nam/i.test(input) ? "Vietnam" : "",
    });

    const parsed = {
      raw_input: input,
      detail,
      ward: admin.ward,
      district: admin.district,
      province: admin.province,
      country: admin.country,
      geocoding_query: "",
      normalized_address: [detail, ward, district, province]
        .map((item) => item.trim())
        .filter(Boolean)
        .join(", "),
      confidence: "low",
      source: "rule",
    };

    parsed.geocoding_query = this.buildRuleBasedQuery(parsed, input);

    this.logger.info("rule-based address parse", {
      formatted_address: input,
      geocoding_query: parsed.geocoding_query,
    });

    return parsed;
  }

  buildRuleBasedQuery(parsed, fallbackInput) {
    const clean = (value) =>
      String(value || "")
        .replace(
          /\b(district|province|city|town|township|thi tran|huyen|tinh|thanh pho|tp)\b/gi,
          ""
        )
        .replace(/[.,()/\-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const detail = clean(parsed.detail);
    const ward = clean(parsed.ward);
    const district = clean(parsed.district);
    const province = clean(parsed.province);
    const country = clean(parsed.country);

    const candidates = [
      [ward, district, province, country],
      [ward, province, country],
      [district, province, country],
      [province, country],
      [detail, ward, district, province, country],
      [detail, province, country],
    ]
      .map((parts) => parts.filter(Boolean).join(", "))
      .filter(Boolean);

    return candidates[0] || fallbackInput;
  }
}

module.exports = {
  AddressParsingService,
};
