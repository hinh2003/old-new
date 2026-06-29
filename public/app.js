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

function setStatus(type, text) {
  statusBox.className = `status ${type}`;
  statusBox.textContent = text;
}

function resetResult() {
  convertedAddressBox.textContent = "-";
  convertedAddressBox.classList.add("muted");
  provinceBox.textContent = "-";
  districtBox.textContent = "-";
  wardBox.textContent = "-";
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
