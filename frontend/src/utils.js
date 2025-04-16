// --- General Helpers ---

/**
 * Displays a message to the user in a designated element.
 * @param {HTMLElement|null} element - The DOM element to display the message in.
 * @param {string} message - The message text.
 * @param {"info"|"success"|"error"} [type="info"] - The type of message (affects styling).
 */
export function displayMessage(element, message, type = "info") {
  if (!element) return;
  // Clear previous types
  element.classList.remove("error", "success", "info");

  if (message) {
    element.textContent = message;
    element.classList.add(type); // Add the type class (error, success, info)
    element.style.display = "block";
  } else {
    element.textContent = "";
    element.style.display = "none";
  }
}

/**
 * Sets the loading state for a button element.
 * Disables the button and changes its text/appearance during loading.
 * @param {HTMLButtonElement|null} button - The button element.
 * @param {boolean} isLoading - Whether the button should be in a loading state.
 */
export function setLoadingState(button, isLoading) {
  if (!button) return;
  if (isLoading) {
    // Store original text if not already stored
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.disabled = true;
    // Add spinner or change text (basic text change for now)
    button.textContent = "Verarbeite...";
    button.classList.add("loading"); // Add class for potential spinner styling
  } else {
    button.disabled = false;
    // Restore original text
    button.textContent = button.dataset.originalText || "Aktion Ausführen";
    // Clear original text storage
    delete button.dataset.originalText;
    button.classList.remove("loading");
  }
}

/**
 * Asynchronously hashes an email string using SHA-256 for privacy.
 * @param {string} email - The email address to hash.
 * @returns {Promise<string>} The SHA-256 hash as a hex string, or "hash_error" on failure.
 */
export async function hashEmail(email) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(email.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (error) {
    console.error("Error hashing email:", error);
    return "hash_error";
  }
}

/**
 * Calculates the delay for the next retry attempt using exponential backoff with jitter.
 * @param {number} retryCount - The current retry attempt number (starting from 0).
 * @param {Object} config - Retry configuration object.
 * @param {number} config.INITIAL_DELAY - Initial delay in ms.
 * @param {number} config.BACKOFF_FACTOR - Backoff multiplier.
 * @param {number} config.MAX_DELAY - Maximum delay in ms.
 * @returns {number} The calculated delay in milliseconds.
 */
export function getRetryDelay(retryCount, config) {
  const delay = Math.min(
    config.INITIAL_DELAY * Math.pow(config.BACKOFF_FACTOR, retryCount),
    config.MAX_DELAY
  );
  return delay + Math.random() * 1000; // Add jitter
}
