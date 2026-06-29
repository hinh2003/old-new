const form = document.getElementById("convert-form");
const addressInput = document.getElementById("address-input");
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
    boundaryLayer: null,
    element: inputMapElement,
    statusEl: inputMapStatus,
    center: [16.047079, 108.20623],
    zoom: 6,
  },
  result: {
    map: null,
    pointLayer: null,
    boundaryLayer: null,
    element: resultMapElement,
    statusEl: resultMapStatus,
    center: [16.047079, 108.20623],
    zoom: 6,
  },
};

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

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    opacity: 1,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(store.map);

  return store.map;
}

function clearMapLayers(which) {
  const store = mapStores[which];
  if (!store?.map) return;

  if (store.pointLayer) {
    store.map.removeLayer(store.pointLayer);
    store.pointLayer = null;
  }

  if (store.boundaryLayer) {
    store.map.removeLayer(store.boundaryLayer);
    store.boundaryLayer = null;
  }
}

function fitMapToLayers(which) {
  const store = mapStores[which];
  if (!store?.map) return;

  const layers = [];
  if (store.pointLayer) layers.push(store.pointLayer);
  if (store.boundaryLayer) layers.push(store.boundaryLayer);

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
  const geometry = which === "result" ? result?.matched_feature?.geometry : null;

  if (which === "input" && Number.isFinite(coords?.latitude) && Number.isFinite(coords?.longitude)) {
    const latlng = [coords.latitude, coords.longitude];
    store.pointLayer = L.circleMarker(latlng, {
      radius: 8,
      color: "#7cdbff",
      weight: 3,
      fillColor: "#5eead4",
      fillOpacity: 1,
    }).addTo(store.map);
  }

  if (which === "result" && geometry) {
    store.boundaryLayer = L.geoJSON(
      {
        type: "Feature",
        properties: {},
        geometry,
      },
      {
        style: {
          color: "#8cfdf2",
          weight: 6,
          opacity: 1,
          fillColor: "#56e7d2",
          fillOpacity: 0.44,
        },
      }
    ).addTo(store.map);
  }

  if (store.pointLayer || store.boundaryLayer) {
    store.map.invalidateSize();
    fitMapToLayers(which);
    setMapStatus(
      which,
      which === "input"
        ? "Đã hiển thị vị trí địa chỉ mới."
        : "Đã hiển thị địa giới cũ tương ứng."
    );
  } else {
    store.map.invalidateSize();
    store.map.setView(store.center, store.zoom);
    setMapStatus(
      which,
      which === "input"
        ? "Chưa có dữ liệu."
        : "Hãy nhập địa chỉ để xem."
    );
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
  clearMapLayers("result");

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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formatted_address = addressInput.value.trim();

  if (!formatted_address) {
    setStatus("error", "Vui lòng nhập địa chỉ hợp lệ.");
    return;
  }

  setStatus("neutral", "Đang tìm tọa độ và tra địa chỉ cũ...");
  submitButton.disabled = true;

  try {
    const response = await fetch("/convert-address", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        formatted_address,
      }),
    });

    const result = await response.json();
    setResult(result);
  } catch (error) {
    setStatus("error", "Lỗi mạng, vui lòng thử lại.");
  } finally {
    submitButton.disabled = false;
  }
});

heroTitle.textContent = "Nhập địa chỉ mới, xem địa chỉ cũ ngay";
heroCopy.textContent =
  "Nhập địa chỉ bạn đang dùng, hệ thống sẽ giúp bạn tìm lại địa chỉ cũ một cách nhanh gọn và dễ hiểu.";
formTitle.textContent = "Nhập địa chỉ mới";
formSubtitle.textContent =
  "Nhập đúng địa chỉ bạn đang dùng để hệ thống tra ra địa chỉ cũ.";
submitButton.textContent = "Chuyển đổi";
setStatus("neutral", "Chưa chạy truy vấn.");
resetResult();

if (hintBadge) {
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

if (window.L) {
  ensureMap("input");
  ensureMap("result");
}
