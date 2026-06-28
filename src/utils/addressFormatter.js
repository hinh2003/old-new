function normalizePart(value) {
  return String(value || "").trim();
}

function removeDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function splitAddress(address) {
  return String(address || "")
    .split(",")
    .map(normalizePart)
    .filter(Boolean);
}

function isAdministrativePart(part) {
  const value = removeDiacritics(part).toLowerCase();
  return (
    /\b(xa|phuong|thi tran|quan|huyen|tinh|thanh pho|tp|ward|district|province|city|commune|township)\b/.test(
      value
    ) ||
    /\b(vietnam|viet nam)\b/.test(value)
  );
}

function buildAddressWithAdministrativeTail(formattedAddress, administrative) {
  const parts = splitAddress(formattedAddress);
  const replacement = [
    normalizePart(administrative.ward),
    normalizePart(administrative.district),
    normalizePart(administrative.province),
  ].filter(Boolean);

  if (parts.length === 0) {
    return replacement.join(", ");
  }

  const adminStartIndex = parts.findIndex((part) => isAdministrativePart(part));
  const detailParts =
    adminStartIndex === -1 ? parts : parts.slice(0, adminStartIndex);

  if (detailParts.length === 0) {
    return replacement.join(", ");
  }

  return [...detailParts, ...replacement].join(", ");
}

module.exports = {
  splitAddress,
  buildAddressWithAdministrativeTail,
};
