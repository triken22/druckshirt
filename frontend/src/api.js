import { CONFIG, ErrorTypes, AppError, RETRY_CONFIG } from "./config.js";

/**
 * Generic API call helper with retries and error handling.
 * @param {string} endpoint - API endpoint (relative to API_BASE_URL)
 * @param {Object} options - fetch options (method, headers, body, etc.)
 * @param {number} [retries=RETRY_CONFIG.MAX_RETRIES]
 * @returns {Promise<any>} - Parsed JSON response
 */
export async function makeApiCall(
  endpoint,
  options = {},
  retries = RETRY_CONFIG.MAX_RETRIES
) {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${CONFIG.API_BASE_URL}${endpoint}`;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      const contentType = response.headers.get("content-type") || "";
      let data = null;
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }
      if (!response.ok) {
        throw new AppError(data?.error || response.statusText, ErrorTypes.API, {
          status: response.status,
          data,
        });
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((res) =>
          setTimeout(res, getRetryDelay(attempt, RETRY_CONFIG))
        );
      }
    }
  }
  throw lastError;
}

// --- Specific API endpoint functions ---

export function fetchProducts() {
  return makeApiCall("/api/printful/products", { method: "GET" });
}

export function uploadImage(formData) {
  return makeApiCall("/upload-image", {
    method: "POST",
    body: formData,
    // fetch will set the correct Content-Type for FormData
  });
}

export function generateImage(prompt, grantId) {
  return makeApiCall("/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, grant_id: grantId }),
  });
}

export function getTokenBalance(grantId) {
  return makeApiCall(`/token-balance/${grantId}`, { method: "GET" });
}

export function purchaseTokens(bundleId, email) {
  return makeApiCall("/stripe/create-token-purchase-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bundle_id: bundleId, email }),
  });
}

export function createTshirtOrder(orderDetails) {
  return makeApiCall("/stripe/create-tshirt-order-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderDetails),
  });
}

export function getShippingOptions(recipient, items) {
  return makeApiCall("/printful/shipping-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient, items }),
  });
}

export function recoverGrantId(email) {
  return makeApiCall("/recover-grant-id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

// Helper for retry delay (imported from utils if needed)
function getRetryDelay(retryCount, config) {
  const delay = Math.min(
    config.INITIAL_DELAY * Math.pow(config.BACKOFF_FACTOR, retryCount),
    config.MAX_DELAY
  );
  return delay + Math.random() * 1000; // Add jitter
}
