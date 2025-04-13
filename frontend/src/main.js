import * as Sentry from "@sentry/browser";

/**
 * @typedef {Object} Config
 * @property {string} STRIPE_PUBLISHABLE_KEY - Stripe publishable key for payment processing
 * @property {string} API_BASE_URL - Base URL for API endpoints
 * @property {Object} POSTHOG - PostHog configuration
 * @property {string} POSTHOG.API_KEY - PostHog API key
 * @property {string} POSTHOG.HOST_URL - PostHog host URL
 * @property {Object} TOKENS - Token-related configuration
 * @property {string} TOKENS.BUNDLE_ID - Default token bundle ID
 * @property {number} TOKENS.PRICE_EUR - Price in EUR for token bundle
 * @property {Object} SENTRY - Sentry configuration
 * @property {string} SENTRY.DSN - Sentry DSN
 * @property {number} SENTRY.SAMPLE_RATE - Sentry sample rate
 */

/**
 * Application configuration object.
 * Values are loaded from environment variables where available.
 * @type {Config}
 */
const CONFIG = {
  STRIPE_PUBLISHABLE_KEY:
    import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder",
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || "/api",
  POSTHOG: {
    API_KEY: import.meta.env.VITE_POSTHOG_API_KEY,
    HOST_URL:
      import.meta.env.VITE_POSTHOG_HOST_URL || "https://us.i.posthog.com",
  },
  TOKENS: {
    BUNDLE_ID: "bundle_10_tokens",
    PRICE_EUR: 5,
  },
  SENTRY: {
    DSN: import.meta.env.VITE_SENTRY_DSN || "",
    SAMPLE_RATE: 0.2,
  },
};

/**
 * Error types for application-specific errors
 * @enum {string}
 */
const ErrorTypes = {
  NETWORK: "NETWORK_ERROR",
  API: "API_ERROR",
  VALIDATION: "VALIDATION_ERROR",
  PAYMENT: "PAYMENT_ERROR",
  UPLOAD: "UPLOAD_ERROR",
  UNKNOWN: "UNKNOWN_ERROR",
  INITIALIZATION: "INITIALIZATION_ERROR",
  CONFIGURATION: "CONFIGURATION_ERROR",
};

/**
 * Custom error class for application-specific errors
 * @extends Error
 */
class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {ErrorTypes} type - Type of error
   * @param {Object} [details] - Additional error details
   */
  constructor(message, type = ErrorTypes.UNKNOWN, details = {}) {
    super(message);
    this.name = "AppError";
    this.type = type;
    this.details = details;
    this.timestamp = new Date();
  }
}

/**
 * Retry configuration for network requests
 * @type {Object}
 */
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 5000,
  BACKOFF_FACTOR: 2,
};

// --- Sentry Initialization ---
// Configure Sentry DSN via VITE_SENTRY_DSN environment variable
const APP_ENV =
  window.location.hostname === "localhost" ? "development" : "production";

if (CONFIG.SENTRY.DSN) {
  Sentry.init({
    dsn: CONFIG.SENTRY.DSN,
    integrations: [
      // Default integrations handle unhandled exceptions, rejections, etc.
    ],
    tracesSampleRate: CONFIG.SENTRY.SAMPLE_RATE,
    environment: APP_ENV,
    beforeSend(event, hint) {
      console.log("Sentry event (frontend) prepared:", event, hint);
      return event;
    },
  });
  console.log("Sentry initialized (Frontend)");
  Sentry.setTag("environment", APP_ENV);
} else {
  console.warn("Sentry DSN not configured. Sentry disabled (Frontend).");
}
// --- End Sentry Initialization ---

console.log("DruckMeinShirt frontend loaded!");

// Initialize PostHog with configuration from CONFIG
posthog.init(CONFIG.POSTHOG.API_KEY, {
  api_host: CONFIG.POSTHOG.HOST_URL,
  person_profiles: "identified_only",
});

/**
 * Checks and returns the current PostHog opt-out state
 * @returns {Promise<boolean>} True if opted out, false if opted in
 */
async function checkOptOutState() {
  // First check localStorage
  const storedState = localStorage.getItem("posthog_opted_out");
  if (storedState !== null) {
    return storedState === "true";
  }

  // If not in localStorage, check PostHog's internal state
  if (window.posthog) {
    const hasOptedOut = await new Promise((resolve) => {
      window.posthog.has_opted_out_capturing(resolve);
    });
    // Store the state for future reference
    localStorage.setItem("posthog_opted_out", hasOptedOut.toString());
    return hasOptedOut;
  }

  // Default to opted out if PostHog is not available
  return true;
}

/**
 * Handles changes to the PostHog opt-out toggle
 * @param {Event} event - The change event from the toggle
 */
async function handlePostHogOptOutToggle(event) {
  if (!window.posthog) {
    console.warn("PostHog not available. Analytics disabled.");
    if (posthogOptOutToggle) {
      posthogOptOutToggle.disabled = true;
    }
    return;
  }

  const isOptingOut = event.target.checked;
  if (isOptingOut) {
    window.posthog.opt_out_capturing();
  } else {
    window.posthog.opt_in_capturing();
  }

  // Update localStorage
  localStorage.setItem("posthog_opted_out", isOptingOut.toString());
}

// Initialize Stripe when the page loads
let stripe = null;
let paymentElement = null;
let currentClientSecret = null;
let currentGrantId = null;

// --- DOM Elements ---
let tokenBalanceDisplay,
  imageUploadInput,
  imageUploadButton,
  imageUploadResult,
  uploadStatus;
let emailInput,
  buyTokensButton,
  paymentElementContainer,
  submitPaymentButton,
  paymentMessage,
  grantIdDisplay;
let aiPromptInput, aiGenerateButton, aiStatus, aiResultsGrid;
let productListDiv, colorSwatchesDiv, mockupImageOverlay;
let imagePreviewUpload, imagePreviewAi;
let tabButtons, tabContents;

// --- State Variables ---
let availableProducts = []; // Will now store more details, including placements
let selectedProduct = null; // Will store the full product object
let selectedVariant = null; // Includes color, size, and variant ID
let selectedImageUrl = null; // URL of the image chosen for design

// --- DOM Elements (Add Phase 3) ---
let sizeSelectorDiv, quantityInput, proceedToCheckoutButton;
let checkoutSection,
  orderSummaryDiv,
  shippingForm,
  shippingNameInput,
  shippingAddress1Input,
  shippingAddress2Input,
  shippingCityInput,
  shippingZipInput,
  shippingCountrySelect,
  shippingEmailInput,
  getShippingButton;
let shippingOptionsContainer, shippingOptionsListDiv, shippingStatusDiv;
let tshirtPaymentContainer,
  tshirtPaymentElementContainer,
  submitTshirtOrderButton,
  tshirtPaymentMessage;
let recoverySection,
  recoveryEmailInput,
  recoveryRequestButton,
  recoveryMessageDiv;
let designImageContainer, imageScaleSlider;
let navButtons;

// --- State Variables (Add Phase 3) ---
let selectedSize = null;
let shippingOptions = [];
let selectedShippingOption = null;
let tshirtClientSecret = null;
let tshirtPaymentElement = null;

// Mockup Interaction State
let isDragging = false;
let dragStartX, dragStartY;
let imageStartLeft, imageStartTop;
let isResizing = false;
let resizeStartX, resizeStartY;
let imageStartWidth, imageStartHeight;

// --- PostHog Import & Config ---
// Remove JS import - handled by snippet
// Remove placeholder config vars - handled by snippet

// --- DOM Elements ---
let posthogOptOutToggle;

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  // Select DOM Elements
  tokenBalanceDisplay = document.getElementById("token-balance-display");
  imageUploadInput = document.getElementById("image-upload-input");
  imageUploadButton = document.getElementById("image-upload-button");
  imageUploadResult = document.getElementById("image-upload-result");
  uploadStatus = document.getElementById("upload-status");
  imagePreviewUpload = document.getElementById("image-preview-upload");
  emailInput = document.getElementById("email-input");
  buyTokensButton = document.getElementById("buy-tokens-button");
  paymentElementContainer = document.getElementById(
    "payment-element-container"
  );
  submitPaymentButton = document.getElementById("submit-payment-button");
  paymentMessage = document.getElementById("payment-message");
  grantIdDisplay = document.getElementById("grant-id-display");

  // Select Phase 2 Elements
  aiPromptInput = document.getElementById("ai-prompt-input");
  aiGenerateButton = document.getElementById("ai-generate-button");
  aiStatus = document.getElementById("ai-status");
  aiResultsGrid = document.getElementById("ai-results-grid");
  imagePreviewAi = document.getElementById("image-preview-ai");
  productListDiv = document.getElementById("product-list");
  colorSwatchesDiv = document.getElementById("color-swatches");
  mockupImageOverlay = document.getElementById("design-image-overlay");
  tabButtons = document.querySelectorAll(".tab-button");
  tabContents = document.querySelectorAll(".tab-content");

  // Select Phase 3 Elements
  sizeSelectorDiv = document.getElementById("size-selector");
  quantityInput = document.getElementById("quantity-input");
  proceedToCheckoutButton = document.getElementById(
    "proceed-to-checkout-button"
  );
  checkoutSection = document.getElementById("checkout-section");
  orderSummaryDiv = document.getElementById("order-summary");
  shippingForm = document.getElementById("shipping-form");
  shippingNameInput = document.getElementById("shipping-name");
  shippingAddress1Input = document.getElementById("shipping-address1");
  shippingAddress2Input = document.getElementById("shipping-address2");
  shippingCityInput = document.getElementById("shipping-city");
  shippingZipInput = document.getElementById("shipping-zip");
  shippingCountrySelect = document.getElementById("shipping-country");
  shippingEmailInput = document.getElementById("shipping-email");
  getShippingButton = document.getElementById("get-shipping-button");
  shippingOptionsContainer = document.getElementById(
    "shipping-options-container"
  );
  shippingOptionsListDiv = document.getElementById("shipping-options-list");
  shippingStatusDiv = document.getElementById("shipping-status");
  tshirtPaymentContainer = document.getElementById("tshirt-payment-container");
  tshirtPaymentElementContainer = document.getElementById(
    "tshirt-payment-element-container"
  );
  submitTshirtOrderButton = document.getElementById(
    "submit-tshirt-order-button"
  );
  tshirtPaymentMessage = document.getElementById("tshirt-payment-message");
  recoverySection = document.getElementById("recovery-section");
  recoveryEmailInput = document.getElementById("recovery-email-input");
  recoveryRequestButton = document.getElementById("recovery-request-button");
  recoveryMessageDiv = document.getElementById("recovery-message");
  designImageContainer = document.getElementById("design-image-container");
  imageScaleSlider = document.getElementById("image-scale-slider");
  navButtons = document.querySelectorAll(".nav-button");

  posthogOptOutToggle = document.getElementById("posthog-opt-out-toggle");

  // Initialize Stripe
  try {
    if (
      !CONFIG.STRIPE_PUBLISHABLE_KEY ||
      CONFIG.STRIPE_PUBLISHABLE_KEY === "pk_test_placeholder"
    ) {
      throw new AppError(
        ErrorTypes.CONFIGURATION,
        "Stripe publishable key not configured"
      );
    }
    stripe = await loadStripe(CONFIG.STRIPE_PUBLISHABLE_KEY);
    if (!stripe) {
      throw new AppError(
        ErrorTypes.INITIALIZATION,
        "Stripe failed to initialize"
      );
    }
    console.log("Stripe initialized successfully");
  } catch (error) {
    console.error("Failed to initialize Stripe:", error);
    displayMessage(
      paymentMessage,
      "Stripe konnte nicht initialisiert werden. Bitte laden Sie die Seite neu.",
      "error"
    );
    // Report to Sentry and PostHog
    if (Sentry) {
      Sentry.captureException(error);
    }
    await captureErrorEvent(error, "stripe_initialization", {
      stripe_key_configured: !!CONFIG.STRIPE_PUBLISHABLE_KEY,
    });
  }

  // Initialize PostHog opt-out state
  if (window.posthog && posthogOptOutToggle) {
    // Check initial opt-out state and update UI
    const hasOptedOut = await checkOptOutState();
    posthogOptOutToggle.checked = hasOptedOut;

    // Set up opt-out toggle listener
    posthogOptOutToggle.addEventListener("change", handlePostHogOptOutToggle);
  } else {
    console.warn("PostHog not available. Analytics disabled.");
    if (posthogOptOutToggle) {
      posthogOptOutToggle.disabled = true;
    }
  }

  // Add Event Listeners
  if (imageUploadButton) {
    imageUploadButton.dataset.originalText = "Für Design Verwenden";
    imageUploadButton.textContent = "Für Design Verwenden";
    imageUploadButton.addEventListener("click", handleUseUploadedImage);
  }
  if (buyTokensButton) {
    buyTokensButton.addEventListener("click", async (e) => {
      e.preventDefault();
      await initiateTokenPurchase();
    });
  }
  if (submitPaymentButton) {
    submitPaymentButton.addEventListener("click", async (e) => {
      e.preventDefault();
      await handleTokenPaymentSubmit();
    });
  }
  if (aiGenerateButton) {
    aiGenerateButton.dataset.originalText = "Generieren";
    aiGenerateButton.textContent = "Generieren";
    aiGenerateButton.addEventListener("click", handleAiGenerate);
  }
  if (tabButtons) {
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.target));
    });
  }
  if (aiResultsGrid) {
    aiResultsGrid.addEventListener("click", handleAiImageSelection);
  }
  if (productListDiv) {
    productListDiv.addEventListener("click", handleProductSelection);
  }
  if (colorSwatchesDiv) {
    colorSwatchesDiv.addEventListener("click", handleColorSelection);
  }

  // Add Phase 3 Listeners
  if (sizeSelectorDiv) {
    sizeSelectorDiv.addEventListener("click", handleSizeSelection);
  }
  if (quantityInput) {
    quantityInput.addEventListener("change", checkDesignCompletion);
  }
  if (proceedToCheckoutButton) {
    proceedToCheckoutButton.addEventListener("click", showCheckoutSection);
  }
  if (getShippingButton) {
    getShippingButton.addEventListener("click", handleGetShippingOptions);
  }
  if (shippingOptionsListDiv) {
    shippingOptionsListDiv.addEventListener(
      "click",
      handleShippingOptionSelection
    );
  }
  if (submitTshirtOrderButton) {
    submitTshirtOrderButton.addEventListener("click", handleSubmitTshirtOrder);
  }
  if (recoveryRequestButton) {
    recoveryRequestButton.addEventListener("click", handleRecoveryRequest);
  }
  if (navButtons) {
    navButtons.forEach((button) => {
      button.addEventListener("click", () =>
        showSection(button.dataset.target)
      );
    });
  }
  // Mockup Interaction Listeners
  if (designImageContainer) {
    designImageContainer.addEventListener("mousedown", startDragging);
    const resizeHandle = designImageContainer.querySelector(".resize-handle");
    if (resizeHandle) {
      resizeHandle.addEventListener("mousedown", startResizing);
    }
  }
  if (imageScaleSlider) {
    imageScaleSlider.addEventListener("input", handleScaleSlider);
  }
  document.addEventListener("mousemove", handleDraggingOrResizing);
  document.addEventListener("mouseup", stopDraggingOrResizing);

  // Initial Token Balance Check
  fetchAndDisplayTokenBalance();
  fetchAndDisplayProducts();

  // Show initial section (design)
  showSection("design-section");
});

// --- Helper Functions ---
function displayMessage(element, message, type = "info") {
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

function setLoadingState(button, isLoading) {
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

function getTokenGrantId() {
  return localStorage.getItem("druckmeinshirt_grant_id");
}

function saveTokenGrantId(grantId) {
  localStorage.setItem("druckmeinshirt_grant_id", grantId);
}

// --- Core Logic ---
async function fetchAndDisplayTokenBalance() {
  const grantId = getTokenGrantId();
  if (!grantId) {
    displayMessage(tokenBalanceDisplay, "Tokens: 0 (Keine Grant ID)", "info");
    return null;
  }

  displayMessage(tokenBalanceDisplay, "Tokens: Prüfe...", "info");
  try {
    const data = await makeApiCall(
      `${CONFIG.API_BASE_URL}/get-token-balance?grant_id=${encodeURIComponent(
        grantId
      )}`,
      {},
      (response) => typeof response.tokens_remaining === "number"
    );

    const balance = data.tokens_remaining;
    displayMessage(tokenBalanceDisplay, `Tokens: ${balance}`, "info");

    // Track balance check in PostHog
    if (window.posthog) {
      window.posthog.capture("token_balance_checked", {
        grant_id: grantId,
        balance: balance,
        success: true,
      });
    }

    return balance;
  } catch (error) {
    displayErrorMessage(tokenBalanceDisplay, error);

    // Track failed balance check in PostHog
    if (window.posthog) {
      window.posthog.capture("token_balance_checked", {
        grant_id: grantId,
        success: false,
        error_type: error.type,
        error_message: error.message,
      });
    }

    return null;
  }
}

/**
 * Handles the upload of a user-selected image
 * @async
 * @param {File} file - The file to upload
 * @returns {Promise<string|null>} The URL of the uploaded image or null if upload failed
 * @throws {AppError} If file validation fails
 */
async function handleImageUpload(file) {
  setLoadingState(imageUploadButton, true);
  displayMessage(uploadStatus, "Lade Bild hoch...", "info");

  await captureAnalyticsEvent("image_upload_started", {
    file_size: file.size,
    file_type: file.type,
  });

  try {
    const formData = new FormData();
    formData.append("image", file);

    const data = await makeApiCall(
      `${CONFIG.API_BASE_URL}/upload-image`,
      {
        method: "POST",
        body: formData,
      },
      (response) => response.url && typeof response.url === "string"
    );

    await captureAnalyticsEvent("image_upload_completed", {
      success: true,
      image_url: data.url,
    });

    return data.url;
  } catch (error) {
    console.error("Image upload failed:", error);
    displayMessage(
      uploadStatus,
      "Fehler beim Hochladen des Bildes. Bitte versuchen Sie es erneut.",
      "error"
    );
    await captureErrorEvent(error, "image_upload", {
      file_size: file.size,
      file_type: file.type,
    });
    return null;
  } finally {
    setLoadingState(imageUploadButton, false);
  }
}

/**
 * Handles the user's request to use an uploaded image
 * @async
 */
async function handleUseUploadedImage() {
  const file = imageUploadInput.files[0];
  setLoadingState(imageUploadButton, true);

  try {
    const imageUrl = await handleImageUpload(file);
    if (imageUrl) {
      updateMockupImage(imageUrl);
      displayMessage(uploadStatus, "Bild erfolgreich hochgeladen.", "success");
      imagePreviewUpload.innerHTML = `<img src="${imageUrl}" alt="Hochgeladenes Bild">`;
    }
  } catch (error) {
    displayErrorMessage(uploadStatus, error);
    imagePreviewUpload.innerHTML = "";
  } finally {
    setLoadingState(imageUploadButton, false);
    imageUploadInput.value = ""; // Clear the input
  }
}

/**
 * Handles the generation of AI images based on user prompt
 * @async
 */
async function handleAiGenerate() {
  const prompt = aiPromptInput.value.trim();
  const grantId = getTokenGrantId();

  if (!prompt) {
    displayMessage(aiStatus, "Bitte gib einen Prompt ein.", "error");
    return;
  }
  if (!grantId) {
    displayMessage(
      aiStatus,
      "Keine Grant ID gefunden. Bitte kaufe zuerst Tokens.",
      "error"
    );
    return;
  }

  displayMessage(aiStatus, "Generiere Bilder... (kostet 1 Token)", "info");
  setLoadingState(aiGenerateButton, true);
  aiResultsGrid.innerHTML = ""; // Clear previous results
  imagePreviewAi.innerHTML = ""; // Clear selection preview

  try {
    // Track generation attempt in PostHog
    if (window.posthog) {
      window.posthog.capture("ai_prompt_submitted", {
        prompt_length: prompt.length,
        grant_id: grantId,
      });
    }

    const data = await makeApiCall(
      `${CONFIG.API_BASE_URL}/generate-image`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, grant_id: grantId }),
      },
      (response) => Array.isArray(response.images) && response.images.length > 0
    );

    displayMessage(
      aiStatus,
      "Generierung erfolgreich! Wähle ein Bild.",
      "success"
    );

    data.images.forEach((imageUrl) => {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = "Generiertes AI Bild";
      img.dataset.imageUrl = imageUrl;
      aiResultsGrid.appendChild(img);
    });

    // Update token balance after successful generation
    await fetchAndDisplayTokenBalance();

    // Track successful generation in PostHog
    if (window.posthog) {
      window.posthog.capture("ai_image_generated", {
        success: true,
        num_images_returned: data.images.length,
        prompt_length: prompt.length,
        revised_prompt: data.revised_prompt,
      });
    }
  } catch (error) {
    displayErrorMessage(aiStatus, error);

    // Track failed generation in PostHog
    if (window.posthog) {
      window.posthog.capture("ai_image_generated", {
        success: false,
        error_type: error.type,
        error_message: error.message,
        prompt_length: prompt.length,
      });
    }
  } finally {
    setLoadingState(aiGenerateButton, false);
  }
}

async function handleAiImageSelection(event) {
  const imageElement = event.target.closest(".ai-result-image");
  if (!imageElement) return;

  await captureAnalyticsEvent("ai_image_selected", {
    image_source: "ai_generated",
    image_id: imageElement.dataset.imageId,
  });

  selectedImageUrl = imageElement.src;
  updateMockupWithSelectedImage(selectedImageUrl);
}

async function fetchAndDisplayProducts() {
  if (!productListDiv) return;
  productListDiv.innerHTML = "<p>Lade T-Shirt Produkte...</p>";
  try {
    // Assume the backend endpoint returns products including placement details now
    const response = await fetch(`${CONFIG.API_BASE_URL}/printful/products`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    // Store the full product data, expecting it to include placements array
    availableProducts = data.products || [];

    if (availableProducts.length === 0) {
      productListDiv.innerHTML = "<p>Keine Produkte gefunden.</p>";
      return;
    }

    productListDiv.innerHTML = "";
    availableProducts.forEach((product) => {
      // Verify product has necessary data (like placements) before adding
      if (product.name && product.id /* && product.placements */) {
        // Add check for placements once backend provides it
        const item = document.createElement("div");
        item.classList.add("product-item");
        item.textContent = product.name;
        item.dataset.productId = product.id;
        productListDiv.appendChild(item);
      } else {
        console.warn("Skipping product due to missing data:", product);
      }
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    productListDiv.innerHTML = "<p>Fehler beim Laden der Produkte.</p>";
    Sentry.captureException(error, { tags: { context: "fetchProducts" } }); // Capture handled error
  }
}

async function handleProductSelection(event) {
  const productElement = event.target.closest(".product-item");
  if (!productElement) return;

  const productId = productElement.dataset.productId;
  selectedProduct = availableProducts.find((p) => p.id === productId);

  await captureAnalyticsEvent("product_selected", {
    product_id: productId,
    product_type: selectedProduct.type,
    product_name: selectedProduct.name,
  });

  updateProductDisplay();
}

function displayColorSwatches(product) {
  if (!colorSwatchesDiv) return;
  colorSwatchesDiv.innerHTML = ""; // Clear previous swatches

  if (
    !product ||
    !product.available_colors ||
    product.available_colors.length === 0
  ) {
    colorSwatchesDiv.innerHTML =
      "<p>Keine Farben für dieses Produkt verfügbar.</p>";
    return;
  }

  product.available_colors.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.classList.add("color-swatch");
    swatch.style.backgroundColor = color.code; // Use color code for background
    swatch.title = color.name; // Tooltip with color name
    swatch.dataset.colorName = color.name;
    swatch.dataset.colorCode = color.code;
    colorSwatchesDiv.appendChild(swatch);
  });
}

async function handleColorSelection(event) {
  const colorElement = event.target.closest(".color-swatch");
  if (!colorElement) return;

  const colorId = colorElement.dataset.colorId;
  selectedVariant = selectedProduct.variants.find(
    (v) => v.color_id === colorId
  );

  await captureAnalyticsEvent("color_selected", {
    product_id: selectedProduct?.id,
    color_id: colorId,
    color_name: selectedVariant?.color_name,
  });

  updateMockupWithSelectedColor();
}

// --- Phase 3 Helper Functions ---
function checkDesignCompletion() {
  const isComplete =
    selectedProduct &&
    selectedVariant && // Includes color
    selectedSize &&
    selectedImageUrl &&
    quantityInput.value >= 1;

  if (proceedToCheckoutButton) {
    proceedToCheckoutButton.disabled = !isComplete;
    displayMessage(
      document.getElementById("design-status"),
      isComplete
        ? "Design bereit für Checkout."
        : "Bitte vervollständige dein Design (Produkt, Farbe, Größe, Bild, Menge).",
      isComplete ? "success" : "info"
    );
  }
  return isComplete; // Return status for other functions
}

function showSection(sectionId) {
  const sections = document.querySelectorAll(".section");
  sections.forEach((section) => {
    section.style.display = section.id === sectionId ? "block" : "none";
  });

  trackPageView(sectionId);
}

function getPlacementData() {
  // --- Phase 4.1 Implementation using fetched data ---

  if (
    !designImageContainer ||
    !designImageContainer.parentElement ||
    !selectedImageUrl ||
    !selectedProduct
  ) {
    console.error(
      "Missing elements, image URL, or selected product for placement data."
    );
    return null;
  }

  // --- ASSUMPTION 1: Printful Template DPI ---
  // Still required to convert pixel dimensions from Catalog API to inches for Order API.
  // VERIFY THIS VALUE (300 is common for print).
  const ASSUMED_PRINTFUL_TEMPLATE_DPI = 300;

  // --- ASSUMPTION 2: Visual Mockup DPI Conversion ---
  // Still required to convert visual pixel interaction to design inches.
  // Adjust VISUAL_TO_INCH_DPI based on your mockup's perceived resolution/scaling.
  const VISUAL_TO_INCH_DPI = 150;

  // --- Get Placement Data from Selected Product ---
  const PLACEMENT_IDENTIFIER = "front"; // Assuming "front" placement for now
  const productPlacement = selectedProduct.placements?.find(
    (p) => p.placement === PLACEMENT_IDENTIFIER
  );

  if (
    !productPlacement ||
    !productPlacement.print_area_width_px ||
    !productPlacement.print_area_height_px
  ) {
    console.error(
      `Required placement data (incl. print_area dimensions) for '${PLACEMENT_IDENTIFIER}' not found in selected product object:`,
      selectedProduct
    );
    displayMessage(
      document.getElementById("design-status"),
      "FEHLER: Druckbereich-Daten für Produkt fehlen!",
      "error"
    );
    return null; // Cannot proceed without print area dimensions
  }

  // --- CALCULATIONS ---

  // 1. Print Area Dimensions in Inches (Required for Order API)
  const area_width_inches =
    productPlacement.print_area_width_px / ASSUMED_PRINTFUL_TEMPLATE_DPI;
  const area_height_inches =
    productPlacement.print_area_height_px / ASSUMED_PRINTFUL_TEMPLATE_DPI;

  // 2. Design Dimensions & Position in Pixels (from visual mockup interaction)
  const containerRect = designImageContainer.getBoundingClientRect();
  const mockupRect = designImageContainer.parentElement.getBoundingClientRect();
  if (mockupRect.width === 0 || mockupRect.height === 0) {
    console.error("Mockup area has zero dimensions visually.");
    return null;
  }
  const pixelWidth = containerRect.width;
  const pixelHeight = containerRect.height;
  const pixelLeft = Math.max(0, containerRect.left - mockupRect.left);
  const pixelTop = Math.max(0, containerRect.top - mockupRect.top);

  // 3. Convert Design Pixels to Inches (for Order API)
  const design_width_inches = pixelWidth / VISUAL_TO_INCH_DPI;
  const design_height_inches = pixelHeight / VISUAL_TO_INCH_DPI;
  const design_left_inches = pixelLeft / VISUAL_TO_INCH_DPI;
  const design_top_inches = pixelTop / VISUAL_TO_INCH_DPI;

  // --- CONSTRUCT API PAYLOAD ---
  const placementData = {
    placement: PLACEMENT_IDENTIFIER,
    layers: [
      {
        type: "file",
        url: selectedImageUrl,
        position: {
          // Print area dimensions in INCHES
          area_width: Number.parseFloat(area_width_inches.toFixed(4)),
          area_height: Number.parseFloat(area_height_inches.toFixed(4)),

          // Design dimensions in INCHES
          width: Number.parseFloat(design_width_inches.toFixed(4)),
          height: Number.parseFloat(design_height_inches.toFixed(4)),

          // Design offset in INCHES from top-left of print area
          top: Number.parseFloat(design_top_inches.toFixed(4)),
          left: Number.parseFloat(design_left_inches.toFixed(4)),
        },
      },
    ],
  };

  console.log(
    "Generated Placement Data (Verify DPI assumptions!):",
    JSON.stringify(placementData, null, 2)
  );
  return placementData;
}

// --- Phase 3 Core Logic ---

function displaySizeSelector(product, selectedColorName) {
  if (!sizeSelectorDiv) return;
  sizeSelectorDiv.innerHTML = ""; // Clear previous

  // Find variants that match the selected color
  const variantsOfColor = product.variants.filter(
    (v) => v.color === selectedColorName && v.in_stock
  );

  if (variantsOfColor.length === 0) {
    sizeSelectorDiv.innerHTML =
      "<p>Keine Größen für diese Farbe verfügbar.</p>";
    return;
  }

  // Create buttons for each available size
  const availableSizes = [...new Set(variantsOfColor.map((v) => v.size))]; // Unique sizes for the color
  availableSizes.sort(); // Optional: sort sizes

  availableSizes.forEach((size) => {
    const button = document.createElement("button");
    button.classList.add("size-button");
    button.textContent = size;
    button.dataset.size = size;
    sizeSelectorDiv.appendChild(button);
  });
}

async function handleSizeSelection(event) {
  const sizeElement = event.target.closest(".size-button");
  if (!sizeElement) return;

  const sizeId = sizeElement.dataset.size;
  selectedSize = sizeId;

  await captureAnalyticsEvent("size_selected", {
    product_id: selectedProduct?.id,
    variant_id: selectedVariant?.id,
    size_id: sizeId,
    size_name: sizeElement.textContent,
  });

  updateSizeDisplay();
  checkDesignCompletion();
}

async function showCheckoutSection() {
  if (!validateDesignSelection()) {
    displayMessage(
      designMessage,
      "Bitte wählen Sie alle erforderlichen Optionen aus.",
      "error"
    );
    return;
  }

  await captureAnalyticsEvent("checkout_started", {
    product_id: selectedProduct?.id,
    variant_id: selectedVariant?.id,
    design_type: selectedImageUrl ? "uploaded" : "ai_generated",
    quantity: parseInt(quantityInput.value, 10),
  });

  checkoutSection.style.display = "block";
  window.scrollTo({ top: checkoutSection.offsetTop, behavior: "smooth" });
}

async function handleGetShippingOptions() {
  if (!shippingForm.checkValidity()) {
    displayMessage(
      shippingStatusDiv,
      "Bitte fülle alle erforderlichen Adressfelder aus.",
      "error"
    );
    shippingForm.reportValidity();
    return;
  }
  if (!selectedVariant || !selectedVariant.id || quantityInput.value < 1) {
    displayMessage(
      shippingStatusDiv,
      "Fehler: Ungültige Bestelldetails.",
      "error"
    );
    return;
  }

  const recipient = {
    address1: shippingAddress1Input.value,
    address2: shippingAddress2Input.value || undefined,
    city: shippingCityInput.value,
    zip: shippingZipInput.value,
    country_code: shippingCountrySelect.value,
  };
  const items = [
    {
      catalog_variant_id: selectedVariant.id,
      quantity: Number.parseInt(quantityInput.value, 10),
    },
  ];

  displayMessage(shippingStatusDiv, "Suche Versandoptionen...", "info");
  setLoadingState(getShippingButton, true);
  shippingOptionsContainer.style.display = "block";
  shippingOptionsListDiv.innerHTML = "";
  tshirtPaymentContainer.style.display = "none";
  selectedShippingOption = null;

  try {
    const response = await fetch(
      `${CONFIG.API_BASE_URL}/printful/shipping-options`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient, items }),
      }
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    shippingOptions = data.shipping_options || [];
    if (shippingOptions.length === 0) {
      displayMessage(
        shippingStatusDiv,
        "Keine Versandoptionen für diese Adresse gefunden.",
        "info"
      );
      return;
    }

    // Display options
    shippingOptions.forEach((option) => {
      const div = document.createElement("div");
      div.classList.add("shipping-option");
      div.dataset.shippingId = option.id;
      const price = (option.rate / 100).toFixed(2);
      div.innerHTML = `<strong>${option.name}</strong> - €${price} (Lieferzeit: ${option.min_delivery_days}-${option.max_delivery_days} Tage)`;
      shippingOptionsListDiv.appendChild(div);
    });
    displayMessage(
      shippingStatusDiv,
      "Bitte wähle eine Versandart.",
      "success"
    );
  } catch (error) {
    console.error("Error fetching shipping options:", error);
    displayMessage(
      shippingStatusDiv,
      `Fehler beim Laden der Versandoptionen: ${error.message}`,
      "error"
    );
    Sentry.captureException(error, {
      tags: { context: "handleGetShippingOptions" },
    }); // Capture handled error
  } finally {
    setLoadingState(getShippingButton, false);
  }
}

async function handleShippingOptionSelection(event) {
  const optionElement = event.target.closest(".shipping-option");
  if (!optionElement) return;

  const shippingId = optionElement.dataset.shippingId;
  selectedShippingOption = shippingOptions.find((opt) => opt.id === shippingId);

  await captureAnalyticsEvent("shipping_option_selected", {
    shipping_id: shippingId,
    shipping_method: selectedShippingOption?.method,
    shipping_price: selectedShippingOption?.rate,
    shipping_country: shippingCountrySelect?.value,
  });

  updateShippingDisplay();
}

async function initiateTshirtPayment() {
  const placement = getPlacementData();
  if (
    !selectedProduct ||
    !selectedVariant ||
    !selectedSize ||
    !selectedShippingOption ||
    !selectedImageUrl ||
    quantityInput.value < 1 ||
    !placement
  ) {
    displayMessage(
      tshirtPaymentMessage,
      "Fehler: Checkout-Details unvollständig oder Platzierungsfehler.",
      "error"
    );
    console.error("Checkout details incomplete:", {
      selectedProduct,
      selectedVariant,
      selectedSize,
      selectedShippingOption,
      selectedImageUrl,
      quantity: quantityInput.value,
      placement,
    });
    return;
  }
  if (!stripe) {
    displayMessage(
      tshirtPaymentMessage,
      "Stripe ist nicht initialisiert.",
      "error"
    );
    return;
  }

  const orderDetails = {
    items: [
      {
        catalog_variant_id: selectedVariant.id,
        quantity: Number.parseInt(quantityInput.value, 10),
        design_url: selectedImageUrl,
        placement: placement, // Include calculated placement
      },
    ],
    shipping_address: {
      name: shippingNameInput.value,
      address1: shippingAddress1Input.value,
      address2: shippingAddress2Input.value || undefined,
      city: shippingCityInput.value,
      zip: shippingZipInput.value,
      country_code: shippingCountrySelect.value,
      email: shippingEmailInput.value,
    },
    shipping_option_id: selectedShippingOption.id,
  };

  displayMessage(
    tshirtPaymentMessage,
    "Initialisiere T-Shirt Zahlung... ",
    "info"
  );
  tshirtPaymentContainer.style.display = "block";

  // --- PostHog Event ---
  if (window.posthog)
    window.posthog.capture("payment_initiated", { purchase_type: "tshirt" });

  try {
    const response = await fetch(
      `${CONFIG.API_BASE_URL}/stripe/create-tshirt-order-intent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_details: orderDetails }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    tshirtClientSecret = data.client_secret;

    // Mount Stripe Payment Element for T-Shirt order
    if (tshirtPaymentElement) {
      tshirtPaymentElement.destroy();
    }
    const elements = stripe.elements({ clientSecret: tshirtClientSecret });
    tshirtPaymentElement = elements.create("payment");
    tshirtPaymentElement.mount("#tshirt-payment-element-container");

    displayMessage(
      tshirtPaymentMessage,
      "Bitte gib deine Zahlungsdaten ein.",
      "info"
    );
  } catch (error) {
    console.error("Error initiating T-Shirt payment:", error);
    displayMessage(tshirtPaymentMessage, `Fehler: ${error.message}`, "error");
    Sentry.captureException(error, {
      tags: { context: "handleTShirtOrderPayment" },
    }); // Capture handled error
    tshirtPaymentContainer.style.display = "none";
  }
}

async function handleSubmitTshirtOrder() {
  setLoadingState(submitTshirtOrderButton, true);
  displayMessage(orderMessage, "Verarbeite Bestellung...", "info");

  await captureAnalyticsEvent("order_submission_started", {
    product_id: selectedProduct?.id,
    variant_id: selectedVariant?.id,
    quantity: parseInt(quantityInput.value, 10),
  });

  try {
    // Existing order submission logic...

    await captureAnalyticsEvent("order_submission_completed", {
      success: true,
      order_id: orderData.id,
      product_id: selectedProduct?.id,
      variant_id: selectedVariant?.id,
      quantity: parseInt(quantityInput.value, 10),
    });

    displayMessage(
      orderMessage,
      "Bestellung erfolgreich aufgegeben!",
      "success"
    );
  } catch (error) {
    console.error("Order submission failed:", error);
    displayMessage(
      orderMessage,
      "Fehler bei der Bestellung. Bitte versuchen Sie es erneut.",
      "error"
    );
    await captureErrorEvent(error, "order_submission", {
      product_id: selectedProduct?.id,
      variant_id: selectedVariant?.id,
    });
  } finally {
    setLoadingState(submitTshirtOrderButton, false);
  }
}

// --- Mockup Interaction Logic ---

function startDragging(e) {
  // Prevent default only for the image container itself, not handles
  if (e.target === designImageContainer) {
    e.preventDefault();
    isDragging = true;
    designImageContainer.style.cursor = "grabbing";
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    imageStartLeft = designImageContainer.offsetLeft;
    imageStartTop = designImageContainer.offsetTop;
  }
}

function startResizing(e) {
  e.preventDefault();
  e.stopPropagation(); // Prevent triggering drag on the container
  isResizing = true;
  resizeStartX = e.clientX;
  resizeStartY = e.clientY;
  imageStartWidth = designImageContainer.offsetWidth;
}

function handleDraggingOrResizing(e) {
  if (!isDragging && !isResizing) return;

  const mockup = document.getElementById("mockup-container");
  if (!mockup) return;

  if (isDragging) {
    const newX = e.clientX - dragStartX;
    const newY = e.clientY - dragStartY;
    updateDesignPosition(newX, newY);
    handleDesignCustomization("drag", {
      position_x: newX,
      position_y: newY,
    });
  }

  if (isResizing) {
    const newWidth = Math.max(50, e.clientX - resizeStartX);
    const newHeight = Math.max(50, e.clientY - resizeStartY);
    updateDesignSize(newWidth, newHeight);
    handleDesignCustomization("resize", {
      width: newWidth,
      height: newHeight,
    });
  }
}

function stopDraggingOrResizing() {
  if (isDragging) {
    isDragging = false;
    designImageContainer.style.cursor = "grab";
    checkDesignCompletion(); // Placement might affect completion
  }
  if (isResizing) {
    isResizing = false;
    checkDesignCompletion(); // Size might affect completion
  }
}

function handleScaleSlider() {
  const scale = parseFloat(imageScaleSlider.value);
  updateDesignScale(scale);
  handleDesignCustomization("scale", { scale_value: scale });
}

async function handleRecoveryRequest() {
  const email = recoveryEmailInput.value.trim();
  if (!email) {
    displayMessage(recoveryMessage, "Bitte E-Mail-Adresse eingeben.", "error");
    return;
  }

  setLoadingState(recoveryRequestButton, true);
  displayMessage(recoveryMessage, "Suche nach Grant IDs...", "info");

  await captureAnalyticsEvent("recovery_request_started", {
    email_provided: !!email,
  });

  try {
    const response = await makeApiCall(
      `${CONFIG.API_BASE_URL}/recover-grant-id`,
      {
        method: "POST",
        body: JSON.stringify({ email }),
      }
    );

    await captureAnalyticsEvent("recovery_request_completed", {
      success: true,
      email_provided: !!email,
    });

    displayMessage(
      recoveryMessage,
      "Wenn Grant IDs gefunden wurden, erhalten Sie eine E-Mail.",
      "success"
    );
  } catch (error) {
    console.error("Recovery request failed:", error);
    displayMessage(
      recoveryMessage,
      "Fehler bei der Suche. Bitte versuchen Sie es später erneut.",
      "error"
    );
    await captureErrorEvent(error, "recovery_request", {
      email_provided: !!email,
    });
  } finally {
    setLoadingState(recoveryRequestButton, false);
  }
}

/** Displays the list of fetched products */
function displayProducts(products) {
  productListDiv.innerHTML = ""; // Clear existing
  if (!products || products.length === 0) {
    productListDiv.innerHTML =
      "<p>Keine Produkte gefunden oder Fehler beim Laden.</p>"; // More informative message
    return;
  }
  products.forEach((product) => {
    const productDiv = document.createElement("div");
    // Use card style if appropriate, or keep specific class
    productDiv.classList.add("product-item", "card"); // Assuming card style is suitable
    productDiv.dataset.productId = product.id;

    // Safely get the image URL
    const imageUrl = product.default_image_url;
    let imageHtml = "";
    if (imageUrl) {
      // Only add image tag if URL exists
      imageHtml = `<img src="${imageUrl}" alt="${product.name}" style="width: 50px; height: auto; margin-right: 10px; vertical-align: middle; border-radius: 3px;">`;
    } else {
      // Optional: Add a placeholder box or icon if no image
      imageHtml = `<span style="display: inline-block; width: 50px; height: 50px; background-color: #eee; margin-right: 10px; vertical-align: middle; text-align: center; line-height: 50px; font-size: 10px; color: #aaa; border-radius: 3px;">No Img</span>`;
    }

    productDiv.innerHTML = `
            ${imageHtml}
            <span>${product.name}</span>
        `;
    productDiv.addEventListener("click", handleProductSelection);
    productListDiv.appendChild(productDiv);
  });
}

/**
 * Implements exponential backoff delay for retries
 * @param {number} retryCount - Current retry attempt number
 * @returns {number} - Delay in milliseconds before next retry
 */
function getRetryDelay(retryCount) {
  const delay = Math.min(
    RETRY_CONFIG.INITIAL_DELAY *
      Math.pow(RETRY_CONFIG.BACKOFF_FACTOR, retryCount),
    RETRY_CONFIG.MAX_DELAY
  );
  return delay + Math.random() * 1000; // Add jitter
}

/**
 * Makes an API call with retry logic
 * @param {string} url - The URL to call
 * @param {Object} options - Fetch options
 * @param {function} [validator] - Optional function to validate response
 * @returns {Promise<any>} - API response
 * @throws {AppError} - Throws AppError with appropriate type and details
 */
async function makeApiCall(url, options = {}, validator = null) {
  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = getRetryDelay(attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        throw new AppError(
          data.error || `HTTP error! status: ${response.status}`,
          ErrorTypes.API,
          { status: response.status, data }
        );
      }

      if (validator && !validator(data)) {
        throw new AppError("Invalid response format", ErrorTypes.API, { data });
      }

      return data;
    } catch (error) {
      lastError =
        error instanceof AppError
          ? error
          : new AppError(
              error.message,
              error instanceof TypeError
                ? ErrorTypes.NETWORK
                : ErrorTypes.UNKNOWN,
              { originalError: error }
            );

      // Don't retry on validation errors or if max retries reached
      if (
        lastError.type === ErrorTypes.VALIDATION ||
        attempt === RETRY_CONFIG.MAX_RETRIES
      ) {
        break;
      }

      // Log retry attempt
      console.warn(
        `API call failed, attempt ${attempt + 1}/${RETRY_CONFIG.MAX_RETRIES}:`,
        lastError
      );

      // Track error in PostHog
      if (window.posthog) {
        window.posthog.capture("api_call_retry", {
          url: url,
          attempt: attempt + 1,
          error_type: lastError.type,
          error_message: lastError.message,
        });
      }
    }
  }

  // Track final failure in PostHog
  if (window.posthog) {
    window.posthog.capture("api_call_failed", {
      url: url,
      error_type: lastError.type,
      error_message: lastError.message,
      attempts: RETRY_CONFIG.MAX_RETRIES,
    });
  }

  // Log to Sentry with context
  Sentry.captureException(lastError, {
    tags: {
      api_url: url,
      error_type: lastError.type,
    },
    extra: {
      attempts: RETRY_CONFIG.MAX_RETRIES,
      options: options,
      timestamp: new Date().toISOString(),
    },
  });

  throw lastError;
}

/**
 * Displays an error message to the user with appropriate context
 * @param {Element} element - DOM element to display message in
 * @param {AppError} error - Error object
 */
function displayErrorMessage(element, error) {
  let userMessage = "Ein Fehler ist aufgetreten.";

  switch (error.type) {
    case ErrorTypes.NETWORK:
      userMessage =
        "Verbindungsfehler. Bitte überprüfe deine Internetverbindung.";
      break;
    case ErrorTypes.API:
      if (error.details?.status === 402) {
        userMessage = "Nicht genügend Tokens vorhanden.";
      } else if (error.details?.status === 404) {
        userMessage = "Die angeforderte Ressource wurde nicht gefunden.";
      } else {
        userMessage =
          "Ein Serverfehler ist aufgetreten. Bitte versuche es später erneut.";
      }
      break;
    case ErrorTypes.VALIDATION:
      userMessage = "Bitte überprüfe deine Eingaben.";
      break;
    case ErrorTypes.PAYMENT:
      userMessage =
        "Fehler bei der Zahlungsverarbeitung. Bitte versuche es erneut.";
      break;
    case ErrorTypes.UPLOAD:
      userMessage =
        "Fehler beim Hochladen der Datei. Bitte versuche es erneut.";
      break;
  }

  displayMessage(element, userMessage, "error");
}

/**
 * Loads the Stripe library asynchronously
 * @param {string} key - The Stripe publishable key
 * @returns {Promise<Stripe>} The initialized Stripe instance
 * @throws {AppError} If Stripe.js is not loaded or initialization fails
 */
async function loadStripe(key) {
  try {
    if (typeof Stripe === "undefined") {
      throw new AppError(
        "Stripe.js script not loaded",
        ErrorTypes.INITIALIZATION,
        { component: "stripe" }
      );
    }
    return Stripe(key);
  } catch (error) {
    throw new AppError(
      "Failed to initialize Stripe",
      ErrorTypes.INITIALIZATION,
      { originalError: error }
    );
  }
}

/**
 * Initiates the token purchase process
 * @async
 * @returns {Promise<void>}
 * @throws {AppError} If validation fails or API call errors
 */
async function initiateTokenPurchase() {
  const email = emailInput.value.trim();

  if (!email) {
    displayMessage(
      paymentMessage,
      "Bitte gib deine Email-Adresse ein.",
      "error"
    );
    return;
  }

  if (!stripe) {
    displayMessage(
      paymentMessage,
      "Stripe wurde nicht korrekt initialisiert.",
      "error"
    );
    return;
  }

  setLoadingState(buyTokensButton, true);
  displayMessage(paymentMessage, "Initiiere Zahlung...", "info");

  try {
    // Track purchase initiation in PostHog
    if (window.posthog) {
      window.posthog.capture("token_purchase_initiated", {
        bundle_id: CONFIG.TOKENS.BUNDLE_ID,
        price_eur: CONFIG.TOKENS.PRICE_EUR,
      });
    }

    const data = await makeApiCall(
      `${CONFIG.API_BASE_URL}/stripe/create-token-purchase-intent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bundle_id: CONFIG.TOKENS.BUNDLE_ID,
          email: email,
        }),
      },
      (response) => response.client_secret && response.grant_id
    );

    currentClientSecret = data.client_secret;
    currentGrantId = data.grant_id;

    // Initialize Stripe payment element
    const elements = stripe.elements({
      clientSecret: currentClientSecret,
      appearance: {
        theme: "stripe",
        variables: {
          colorPrimary: "#3498db",
        },
      },
    });

    if (paymentElement) {
      paymentElement.destroy();
    }

    paymentElement = elements.create("payment");
    paymentElement.mount("#payment-element-container");

    // Show the payment form and submit button
    paymentElementContainer.style.display = "block";
    submitPaymentButton.style.display = "block";
    buyTokensButton.style.display = "none";

    displayMessage(
      paymentMessage,
      "Bitte gib deine Zahlungsinformationen ein.",
      "info"
    );
  } catch (error) {
    displayErrorMessage(paymentMessage, error);

    // Track failed purchase initiation in PostHog
    if (window.posthog) {
      window.posthog.capture("token_purchase_initiated", {
        success: false,
        error_type: error.type,
        error_message: error.message,
        bundle_id: CONFIG.TOKENS.BUNDLE_ID,
      });
    }
  } finally {
    setLoadingState(buyTokensButton, false);
  }
}

/**
 * Handles the submission of the token payment
 * @async
 * @throws {AppError} If payment confirmation fails
 */
async function handleTokenPaymentSubmit() {
  if (!stripe || !currentClientSecret) {
    displayMessage(
      paymentMessage,
      "Zahlungsinitialisierung fehlgeschlagen.",
      "error"
    );
    return;
  }

  setLoadingState(submitPaymentButton, true);
  displayMessage(paymentMessage, "Verarbeite Zahlung...", "info");

  await captureAnalyticsEvent("payment_submission_started", {
    grant_id: currentGrantId,
    client_secret_present: !!currentClientSecret,
  });

  try {
    const { error: submitError } = await stripe.confirmPayment({
      elements: paymentElement,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (submitError) {
      throw new AppError(submitError.message, ErrorTypes.PAYMENT, {
        code: submitError.code,
      });
    }

    displayMessage(paymentMessage, "Zahlung erfolgreich!", "success");
    await captureAnalyticsEvent("payment_submission_completed", {
      success: true,
      grant_id: currentGrantId,
    });

    // Refresh token balance after successful payment
    await fetchAndDisplayTokenBalance();
  } catch (error) {
    console.error("Payment submission failed:", error);
    displayMessage(
      paymentMessage,
      "Zahlung fehlgeschlagen. Bitte versuchen Sie es erneut.",
      "error"
    );
    await captureErrorEvent(error, "payment_submission", {
      grant_id: currentGrantId,
    });
  } finally {
    setLoadingState(submitPaymentButton, false);
  }
}

/**
 * Utility function for capturing PostHog events with error handling
 * @param {string} eventName - Name of the event to capture
 * @param {Object} [properties] - Event properties
 * @returns {Promise<void>}
 */
async function captureAnalyticsEvent(eventName, properties = {}) {
  if (!window.posthog) {
    console.debug("PostHog not available, skipping event capture:", eventName);
    return;
  }

  try {
    const hasOptedOut = await checkOptOutState();
    if (hasOptedOut) {
      console.debug("User opted out, skipping event capture:", eventName);
      return;
    }

    // Add common properties
    const enrichedProperties = {
      ...properties,
      app_version: "1.0.0",
      environment: APP_ENV,
      timestamp: new Date().toISOString(),
    };

    window.posthog.capture(eventName, enrichedProperties);
  } catch (error) {
    console.warn("Failed to capture analytics event:", eventName, error);
    // Report to Sentry if available
    if (Sentry) {
      Sentry.captureException(error);
    }
  }
}

/**
 * Capture error events with standardized properties
 * @param {Error} error - The error object
 * @param {string} context - Where the error occurred
 * @param {Object} [additionalProperties] - Additional event properties
 */
async function captureErrorEvent(error, context, additionalProperties = {}) {
  const errorProperties = {
    error_type: error.type || error.name || "unknown",
    error_message: error.message,
    error_context: context,
    error_timestamp: new Date().toISOString(),
    ...additionalProperties,
  };

  await captureAnalyticsEvent("error_occurred", errorProperties);
}

// Add journey tracking
function trackPageView(section) {
  captureAnalyticsEvent("page_view", {
    section: section,
    timestamp: new Date().toISOString(),
    referrer: document.referrer,
  });
}

// Track design customization
let lastCustomizationEvent = 0;
const CUSTOMIZATION_THROTTLE = 1000; // Throttle to 1 event per second

function handleDesignCustomization(type, properties = {}) {
  const now = Date.now();
  if (now - lastCustomizationEvent < CUSTOMIZATION_THROTTLE) return;

  lastCustomizationEvent = now;
  captureAnalyticsEvent("design_customized", {
    customization_type: type,
    ...properties,
  });
}
