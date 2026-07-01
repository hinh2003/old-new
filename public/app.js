const form = document.getElementById("convert-form");
const addressInput = document.getElementById("address-input");
const suggestionsBox = document.getElementById("suggestions");
const statusBox = document.getElementById("status");
const convertedAddressBox = document.getElementById("converted-address");
const provinceBox = document.getElementById("province");
const districtBox = document.getElementById("district");
const wardBox = document.getElementById("ward");
const heroTitle = document.getElementById("hero-title");
const heroCopy = document.getElementById("hero-copy");
const formTitle = document.getElementById("form-title");
const formSubtitle = document.getElementById("form-subtitle");
const submitButton = document.getElementById("submit-button");
const hintBadge = document.querySelector(".hint-badge");
const inputMapStatus = document.getElementById("input-map-status");
const resultMapStatus = document.getElementById("result-map-status");
const inputMapElement = document.getElementById("input-map");
const resultMapElement = document.getElementById("result-map");

const mapStores = {
  input: {
    map: null,
    pointLayer: null,
    element: inputMapElement,
    statusEl: inputMapStatus,
    center: [16.047079, 108.20623],
    zoom: 6,
  },
  result: {
    map: null,
    baseLayer: null,
    highlightLayer: null,
    highlightLabel: null,
    element: resultMapElement,
    statusEl: resultMapStatus,
    center: [16.047079, 108.20623],
    zoom: 6,
  },
};

let oldBoundariesPromise = null;
let selectedSuggestion = null;
let suggestionRequestController = null;
let suggestionDebounceTimer = null;
let lastSuggestionQuery = "";
let lastSuggestions = [];
let activeSuggestionIndex = -1;

function buildRegionLabel(result, feature) {
  const administrative = result?.converted_administrative || {};
  const props = feature?.properties || {};
  const ward = administrative.ward || props.ten_xa || props.tenXa || "";
  const district = administrative.district || props.ten_huyen || props.tenHuyen || "";
  const province = administrative.province || props.ten_tinh || props.tenTinh || "";
  return [ward, district, province].filter(Boolean).join(", ");
}

function addCenterLabel(store, text, bounds) {
  if (!store?.map || !text || !bounds?.isValid || !bounds.isValid()) return null;

  const center = bounds.getCenter();
  return L.marker(center, {
    interactive: false,
    keyboard: false,
    icon: L.divIcon({
      className: "geojson-label-marker",
      html: `<div class="geojson-label">${text}</div>`,
      iconSize: [1, 1],
    }),
  }).addTo(store.map);
}

function fitToHighlight(store) {
  if (!store?.map || !store.highlightLayer) return;
  const bounds = store.highlightLayer.getBounds();
  if (bounds.isValid()) {
    store.map.fitBounds(bounds.pad(0.18));
  }
}

function cleanupHighlightArtifacts(store) {
  if (!store?.map) return;

  if (store.highlightLabel) {
    store.map.removeLayer(store.highlightLabel);
    store.highlightLabel = null;
  }
}

function setStatus(type, text) {
  statusBox.className = `status ${type}`;
  statusBox.textContent = text;
}

function setMapStatus(which, text) {
  const store = mapStores[which];
  if (store?.statusEl) {
    store.statusEl.textContent = text;
  }
}

function ensureMap(which) {
  const store = mapStores[which];
  if (!store || store.map || !window.L || !store.element) {
    return store?.map || null;
  }

  store.map = L.map(store.element, {
    zoomControl: true,
    scrollWheelZoom: false,
    attributionControl: false,
  }).setView(store.center, store.zoom);

  if (which === "input") {
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      opacity: 1,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(store.map);
  }

  return store.map;
}

function clearMapLayers(which) {
  const store = mapStores[which];
  if (!store?.map) return;

  if (store.pointLayer) {
    store.map.removeLayer(store.pointLayer);
    store.pointLayer = null;
  }

  if (store.highlightLayer) {
    store.map.removeLayer(store.highlightLayer);
    store.highlightLayer = null;
  }

  cleanupHighlightArtifacts(store);
}

function fitMapToLayers(which) {
  const store = mapStores[which];
  if (!store?.map) return;

  const layers = [];
  if (store.pointLayer) layers.push(store.pointLayer);
  if (which !== "result" && store.baseLayer) layers.push(store.baseLayer);
  if (store.highlightLayer) layers.push(store.highlightLayer);

  if (layers.length > 0) {
    const group = L.featureGroup(layers);
    store.map.fitBounds(group.getBounds().pad(0.2));
  }
}

function renderMap(which, result) {
  if (!window.L) return;

  const store = mapStores[which];
  ensureMap(which);
  clearMapLayers(which);

  const coords = result?.geocoded_coordinates || result?.input_coordinates;

  if (
    which === "input" &&
    Number.isFinite(coords?.latitude) &&
    Number.isFinite(coords?.longitude)
  ) {
    const latlng = [coords.latitude, coords.longitude];
    store.pointLayer = L.circleMarker(latlng, {
      radius: 8,
      color: "#7cdbff",
      weight: 3,
      fillColor: "#5eead4",
      fillOpacity: 1,
    }).addTo(store.map);
  }

  if (which === "result") {
    const geometry = result?.matched_feature?.geometry;
    if (geometry) {
      const applyHighlight = (geojson) => {
        if (!mapStores.result.map || !window.L) return;

        if (!store.baseLayer && geojson?.features) {
          store.baseLayer = L.geoJSON(geojson, {
            style: {
              color: "#b9c6d8",
              weight: 0.8,
              opacity: 0.45,
              fillColor: "#f3f7fb",
              fillOpacity: 0.02,
            },
          }).addTo(store.map);
        }

        const featureId = result?.matched_feature?.feature_id;
        const highlighted =
          featureId && geojson?.features
            ? geojson.features.find((feature) => {
                const sourceId = feature.id ?? feature.properties?.ma_xa ?? null;
                return String(sourceId) === String(featureId);
              })
            : null;

        const highlightGeometry = highlighted?.geometry || geometry;

        if (store.highlightLayer) {
          store.map.removeLayer(store.highlightLayer);
          store.highlightLayer = null;
        }
        cleanupHighlightArtifacts(store);

        store.highlightLayer = L.geoJSON(
          {
            type: "Feature",
            properties: {},
            geometry: highlightGeometry,
          },
          {
            style: {
              color: "#21b8a8",
              weight: 3,
              opacity: 1,
              fillColor: "#5eead4",
              fillOpacity: 0.24,
            },
          }
        ).addTo(store.map);

        const regionLabel = buildRegionLabel(result, highlighted || result?.matched_feature);
        if (regionLabel) {
          store.highlightLabel = addCenterLabel(
            store,
            regionLabel,
            store.highlightLayer.getBounds()
          );
        }

        store.map.invalidateSize();
        fitToHighlight(store);
        setMapStatus("result", "Đã hiển thị bản đồ địa giới cũ.");
      };

      if (!store.baseLayer) {
        oldBoundariesPromise =
          oldBoundariesPromise ||
          fetch("/api/old-boundaries.geojson").then((response) => {
            if (!response.ok) {
              throw new Error("Không tải được geojson địa giới cũ.");
            }
            return response.json();
          });

        oldBoundariesPromise
          .then(applyHighlight)
          .catch(() => {
            setMapStatus("result", "Không tải được bản đồ địa giới cũ.");
          });
      } else {
        applyHighlight();
      }
    }
  }

  if (store.pointLayer || store.baseLayer || store.highlightLayer) {
    store.map.invalidateSize();
    if (which === "input") {
      fitMapToLayers(which);
      setMapStatus("input", "Đã hiển thị vị trí địa chỉ mới.");
    }
  } else {
    store.map.invalidateSize();
    store.map.setView(store.center, store.zoom);
    setMapStatus(which, which === "input" ? "Chưa có dữ liệu." : "Hãy nhập địa chỉ để xem.");
  }
}

function resetResult() {
  convertedAddressBox.textContent = "-";
  convertedAddressBox.classList.add("muted");
  provinceBox.textContent = "-";
  districtBox.textContent = "-";
  wardBox.textContent = "-";

  setMapStatus("input", "Chưa có dữ liệu.");
  setMapStatus("result", "Hãy nhập địa chỉ để xem.");

  clearMapLayers("input");
  if (mapStores.result.highlightLayer) {
    mapStores.result.map?.removeLayer(mapStores.result.highlightLayer);
    mapStores.result.highlightLayer = null;
  }
  if (mapStores.result.highlightLabel) {
    mapStores.result.map?.removeLayer(mapStores.result.highlightLabel);
    mapStores.result.highlightLabel = null;
  }

  if (mapStores.input.map) {
    mapStores.input.map.setView(mapStores.input.center, mapStores.input.zoom);
  }
  if (mapStores.result.map) {
    mapStores.result.map.setView(mapStores.result.center, mapStores.result.zoom);
  }
}

function setResult(result) {
  if (!result.success) {
    setStatus("error", result.message || "Chuyển đổi thất bại.");
    resetResult();
    return;
  }

  setStatus("success", "Chuyển đổi thành công.");
  convertedAddressBox.textContent = result.converted_address || "-";
  convertedAddressBox.classList.remove("muted");
  provinceBox.textContent = result.converted_administrative?.province || "-";
  districtBox.textContent = result.converted_administrative?.district || "-";
  wardBox.textContent = result.converted_administrative?.ward || "-";

  renderMap("input", result);
  renderMap("result", result);
}

function clearSuggestions() {
  if (suggestionRequestController) {
    suggestionRequestController.abort();
    suggestionRequestController = null;
  }
  if (suggestionsBox) {
    suggestionsBox.innerHTML = "";
    suggestionsBox.classList.remove("is-open");
  }
  activeSuggestionIndex = -1;
}

function renderSuggestions(items) {
  if (!suggestionsBox) return;

  lastSuggestions = Array.isArray(items) ? items : [];
  suggestionsBox.__items = lastSuggestions;

  if (!Array.isArray(lastSuggestions) || lastSuggestions.length === 0) {
    suggestionsBox.innerHTML = "";
    suggestionsBox.classList.remove("is-open");
    return;
  }

  suggestionsBox.innerHTML = lastSuggestions
    .map((item, index) => {
      const meta = [item.type, item.subtext].filter(Boolean).join(" · ");
      return `
        <button type="button" class="suggestion-item${index === activeSuggestionIndex ? " is-active" : ""}" data-index="${index}">
          <span class="suggestion-item__title">${escapeHtml(item.value)}</span>
          ${meta ? `<span class="suggestion-item__meta">${escapeHtml(meta)}</span>` : ""}
        </button>
      `;
    })
    .join("");

  suggestionsBox.classList.add("is-open");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchSuggestions(query) {
  const normalized = String(query || "").trim();
  if (!normalized) {
    renderSuggestions([]);
    return [];
  }

  if (normalized === lastSuggestionQuery) {
    renderSuggestions(lastSuggestions);
    return lastSuggestions;
  }

  lastSuggestionQuery = normalized;

  if (suggestionRequestController) {
    suggestionRequestController.abort();
  }

  suggestionRequestController = new AbortController();

  try {
    const response = await fetch(`/api/address-suggestions?q=${encodeURIComponent(normalized)}`, {
      signal: suggestionRequestController.signal,
    });

    if (!response.ok) {
      renderSuggestions([]);
      return [];
    }

    const data = await response.json();
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
    renderSuggestions(suggestions);
    return suggestions;
  } catch (_error) {
    renderSuggestions([]);
    return [];
  }
}

function pickSuggestion(item) {
  if (!item) return;

  selectedSuggestion = item;
  addressInput.value = item.value || "";
  clearSuggestions();

  if (Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) {
    renderMap("input", {
      geocoded_coordinates: {
        latitude: item.latitude,
        longitude: item.longitude,
        provider: "serpapi",
        display_name: item.value,
        query: item.value,
      },
    });
    setStatus("neutral", "Đã chọn gợi ý. Bạn có thể bấm Chuyển đổi để tra địa chỉ cũ.");
  } else {
    setStatus("neutral", "Đã chọn gợi ý. Hệ thống sẽ tra tọa độ khi bạn chuyển đổi.");
  }
}

function selectSuggestionByIndex(index) {
  if (!Array.isArray(lastSuggestions) || lastSuggestions.length === 0) return;

  const boundedIndex = Math.max(0, Math.min(index, lastSuggestions.length - 1));
  activeSuggestionIndex = boundedIndex;
  renderSuggestions(lastSuggestions);
}

function wireHintBadge() {
  if (!hintBadge) return;

  const closeHint = () => hintBadge.classList.remove("is-open");

  hintBadge.addEventListener("mouseenter", () => {
    hintBadge.classList.add("is-open");
  });

  hintBadge.addEventListener("mouseleave", closeHint);
  hintBadge.addEventListener("blur", closeHint);
  hintBadge.addEventListener("click", (event) => {
    event.preventDefault();
    hintBadge.classList.toggle("is-open");
  });
}

async function bootstrap() {
  heroTitle.textContent = "Nhập địa chỉ mới, xem địa chỉ cũ ngay";
  heroCopy.textContent =
    "Nhập địa chỉ bạn đang dùng, hệ thống sẽ gợi ý từ SerpApi rồi giúp bạn tìm lại địa chỉ cũ nhanh gọn.";
  formTitle.textContent = "Nhập địa chỉ mới";
  formSubtitle.textContent =
    "Gõ địa chỉ để nhận gợi ý, chọn đúng vị trí rồi chuyển đổi sang địa chỉ cũ.";
  submitButton.textContent = "Chuyển đổi";

  if (window.L) {
    ensureMap("input");
    ensureMap("result");
  }

  wireHintBadge();

  if (addressInput) {
    addressInput.addEventListener("input", () => {
      selectedSuggestion = null;
      clearSuggestions();
      activeSuggestionIndex = -1;
      const value = addressInput.value.trim();

      if (suggestionDebounceTimer) {
        clearTimeout(suggestionDebounceTimer);
      }

      if (!value) {
        lastSuggestionQuery = "";
        return;
      }

      suggestionDebounceTimer = setTimeout(() => {
        fetchSuggestions(value);
      }, 250);
    });

    addressInput.addEventListener("focus", () => {
      const value = addressInput.value.trim();
      if (value) {
        fetchSuggestions(value);
      }
    });

    addressInput.addEventListener("keydown", (event) => {
      if (!suggestionsBox || !suggestionsBox.classList.contains("is-open")) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectSuggestionByIndex(activeSuggestionIndex + 1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        selectSuggestionByIndex(activeSuggestionIndex - 1);
        return;
      }

      if (event.key === "Enter" && activeSuggestionIndex >= 0) {
        event.preventDefault();
        pickSuggestion(lastSuggestions[activeSuggestionIndex]);
        return;
      }

      if (event.key === "Escape") {
        clearSuggestions();
      }
    });
  }

  if (suggestionsBox) {
    suggestionsBox.addEventListener("click", (event) => {
      const button = event.target.closest(".suggestion-item");
      if (!button) return;

      const index = Number(button.dataset.index);
      const loaded = suggestionsBox.__items || [];
      pickSuggestion(loaded[index]);
    });
  }

  document.addEventListener("click", (event) => {
    if (!suggestionsBox || !addressInput) return;

    const insideInput = addressInput.contains(event.target);
    const insideSuggestions = suggestionsBox.contains(event.target);

    if (!insideInput && !insideSuggestions) {
      clearSuggestions();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formatted_address = addressInput.value.trim();

    if (!formatted_address) {
      setStatus("error", "Vui lòng nhập địa chỉ hợp lệ.");
      return;
    }

    const payload = {
      formatted_address,
    };

    if (
      selectedSuggestion &&
      Number.isFinite(selectedSuggestion.latitude) &&
      Number.isFinite(selectedSuggestion.longitude)
    ) {
      payload.latitude = selectedSuggestion.latitude;
      payload.longitude = selectedSuggestion.longitude;
    }

    setStatus("neutral", "Đang lấy tọa độ từ SerpApi và tra địa chỉ cũ...");
    submitButton.disabled = true;

    try {
      const response = await fetch("/convert-address", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      setResult(result);
    } catch (_error) {
      setStatus("error", "Lỗi mạng, vui lòng thử lại.");
    } finally {
      submitButton.disabled = false;
    }
  });

  setStatus("neutral", "Chưa chạy truy vấn.");
  resetResult();

  setMapStatus("result", "Đang tải bản đồ địa giới cũ...");
  oldBoundariesPromise = fetch("/api/old-boundaries.geojson")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Không tải được geojson địa giới cũ.");
      }

      return response.json();
    })
    .then((geojson) => {
      if (!window.L || !mapStores.result.map) return geojson;

      const store = mapStores.result;
      if (!store.baseLayer) {
        store.baseLayer = L.geoJSON(geojson, {
          style: {
            color: "#b9c6d8",
            weight: 0.8,
            opacity: 0.45,
            fillColor: "#f3f7fb",
            fillOpacity: 0.02,
          },
        }).addTo(store.map);

        store.map.fitBounds(store.baseLayer.getBounds().pad(0.05));
        setMapStatus("result", "Đã hiển thị bản đồ địa giới cũ.");
      }

      return geojson;
    })
    .catch(() => {
      setMapStatus("result", "Không tải được bản đồ địa giới cũ.");
      return null;
    });
}

bootstrap();
