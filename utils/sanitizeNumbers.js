// utils/sanitizeNumbers.js

function isNumericString(value) {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    !isNaN(value) &&
    !isNaN(parseFloat(value))
  );
}

export function sanitizeNumbers(obj) {
  if (obj === null || obj === undefined) return obj;

  // handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeNumbers(item));
  }

  // handle objects
  if (typeof obj === "object") {
    const output = {};
    for (const key in obj) {
      const value = obj[key];

      if (isNumericString(value)) {
        // convert string → number
        output[key] = Number(value);
      } else if (typeof value === "object") {
        output[key] = sanitizeNumbers(value);
      } else {
        output[key] = value;
      }
    }
    return output;
  }

  // primitive
  return obj;
}
