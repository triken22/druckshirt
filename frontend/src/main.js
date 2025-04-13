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
// Only initialize if the API key is actually provided
if (CONFIG.POSTHOG.API_KEY) {
  posthog.init(CONFIG.POSTHOG.API_KEY, {
    api_host: CONFIG.POSTHOG.HOST_URL,
    person_profiles: "identified_only", // Consider GDPR implications
  });
  console.log("PostHog initialized (Frontend)");
} else {
  console.warn("PostHog API Key not configured. PostHog disabled (Frontend).");
}

/**
 * Checks and returns the current PostHog opt-out state
 * @returns {Promise<boolean>} True if opted out, false if opted in
 */
async function checkOptOutState() {
  try {
    const hasOptedOut = localStorage.getItem("analytics_opt_out") === "true";
    const checkbox = document.getElementById("posthog-opt-out-toggle");
    if (checkbox) {
      checkbox.checked = hasOptedOut;
    }
    if (hasOptedOut) {
      await window.posthog?.opt_out_capturing();
    } else {
      await window.posthog?.opt_in_capturing();
    }
  } catch (error) {
    console.error("Error checking opt-out state:", error);
  }
}

/**
 * Handles changes to the PostHog opt-out toggle
 * @param {Event} event - The change event from the toggle
 */
async function handlePostHogOptOutToggle(event) {
  try {
    const optOut = event.target.checked;
    localStorage.setItem("analytics_opt_out", optOut);
    if (optOut) {
      await window.posthog?.opt_out_capturing();
    } else {
      await window.posthog?.opt_in_capturing();
    }
  } catch (error) {
    console.error("Error handling opt-out toggle:", error);
    displayErrorMessage(
      document.querySelector(".analytics-opt-out"),
      "Failed to update analytics preferences"
    );
  }
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

// Mockup interaction state
const mockupState = {
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  isResizing: false,
  resizeStartX: 0,
  resizeStartY: 0,
  imageStartWidth: 0,
  imageStartHeight: 0,
  imageStartLeft: 0,
  imageStartTop: 0,
};

// --- PostHog Import & Config ---
// Remove JS import - handled by snippet
// Remove placeholder config vars - handled by snippet

// --- DOM Elements ---
let posthogOptOutToggle;

// --- Design Customization Constants ---
const DESIGN_CONSTRAINTS = {
  MIN_SCALE: 0.5,
  MAX_SCALE: 2.0,
  MIN_SIZE_PX: 50,
  MAX_SIZE_PX: 500,
  POSITION_MARGIN: 10,
};

// --- Design State Management ---
let designState = {
  scale: 1.0,
  position: { x: 0, y: 0 },
  rotation: 0,
  originalSize: { width: 0, height: 0 },
};

/**
 * Persists the current design state to sessionStorage
 */
function saveDesignState() {
  const mockup = document.querySelector(".mockup");
  if (!mockup) return null;

  return {
    width: mockup.style.width,
    height: mockup.style.height,
    left: mockup.style.left,
    top: mockup.style.top,
  };
}

/**
 * Restores the design state from sessionStorage
 */
function restoreDesignState() {
  const savedState = sessionStorage.getItem("druckmeinshirt_design_state");
  if (!savedState) return false;

  try {
    const state = JSON.parse(savedState);
    designState = {
      scale: state.scale || 1.0,
      position: state.position || { x: 0, y: 0 },
      rotation: state.rotation || 0,
      originalSize: state.originalSize || { width: 0, height: 0 },
    };

    // Restore product selection if available
    if (state.productId) {
      selectedProduct = availableProducts.find((p) => p.id === state.productId);
      if (selectedProduct) {
        updateProductDisplay();
      }
    }

    // Restore variant and size if available
    if (state.variantId && selectedProduct) {
      selectedVariant = selectedProduct.variants.find(
        (v) => v.id === state.variantId
      );
      selectedSize = state.size;
      if (selectedVariant) {
        updateVariantDisplay();
      }
    }

    // Restore image if available
    if (state.imageUrl) {
      selectedImageUrl = state.imageUrl;
      updateMockupImage(state.imageUrl);
    }

    // Restore quantity if available
    if (state.quantity && quantityInput) {
      quantityInput.value = state.quantity;
    }

    return true;
  } catch (error) {
    console.error("Error restoring design state:", error);
    return false;
  }
}

// --- Print Area Constants ---
const PRINT_AREA = {
  DPI: 300, // Standard print DPI
  VISUAL_DPI: 150, // Visual mockup DPI
  DEFAULT_MARGIN: 10, // Default margin in pixels
  GUIDE_COLOR: "rgba(255, 0, 0, 0.5)", // Guide visualization color
};

/**
 * Creates and updates the print area visualization
 * @param {Object} placement - Placement data from the product
 */
function updatePrintAreaGuides() {
  if (!mockupImageOverlay || !selectedProduct) return;

  // Find front placement data
  const frontPlacement = selectedProduct.placements?.find(
    (p) => p.placement === "front"
  );
  if (!frontPlacement) {
    console.error("Front placement data not found");
    return;
  }

  // Remove existing guides
  const existingGuide = mockupImageOverlay.querySelector(".print-area-guide");
  if (existingGuide) {
    existingGuide.remove();
  }

  // Create print area guide
  const guide = document.createElement("div");
  guide.classList.add("print-area-guide");

  // Calculate visual dimensions
  const visualWidth =
    (frontPlacement.print_area_width_px / PRINT_AREA.DPI) *
    PRINT_AREA.VISUAL_DPI;
  const visualHeight =
    (frontPlacement.print_area_height_px / PRINT_AREA.DPI) *
    PRINT_AREA.VISUAL_DPI;

  // Style the guide
  Object.assign(guide.style, {
    position: "absolute",
    width: `${visualWidth}px`,
    height: `${visualHeight}px`,
    border: `2px dashed ${PRINT_AREA.GUIDE_COLOR}`,
    pointerEvents: "none",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  });

  // Add guide to mockup
  mockupImageOverlay.appendChild(guide);

  // Update design constraints based on print area
  DESIGN_CONSTRAINTS.MAX_SIZE_PX = Math.min(
    visualWidth - 2 * PRINT_AREA.DEFAULT_MARGIN,
    visualHeight - 2 * PRINT_AREA.DEFAULT_MARGIN
  );
}

/**
 * Validates if the current design fits within the print area
 * @returns {boolean} True if design fits within constraints
 */
function validateDesignPlacement() {
  if (!designImageContainer || !mockupImageOverlay) return false;

  const guide = mockupImageOverlay.querySelector(".print-area-guide");
  if (!guide) return false;

  const guideBounds = guide.getBoundingClientRect();
  const designBounds = designImageContainer.getBoundingClientRect();

  // Check if design fits within print area
  const fitsWidth =
    designBounds.width <= guideBounds.width - 2 * PRINT_AREA.DEFAULT_MARGIN;
  const fitsHeight =
    designBounds.height <= guideBounds.height - 2 * PRINT_AREA.DEFAULT_MARGIN;

  // Check if design is within print area bounds
  const withinBounds =
    designBounds.left >= guideBounds.left + PRINT_AREA.DEFAULT_MARGIN &&
    designBounds.right <= guideBounds.right - PRINT_AREA.DEFAULT_MARGIN &&
    designBounds.top >= guideBounds.top + PRINT_AREA.DEFAULT_MARGIN &&
    designBounds.bottom <= guideBounds.bottom - PRINT_AREA.DEFAULT_MARGIN;

  return fitsWidth && fitsHeight && withinBounds;
}

/**
 * Updates the product display and related elements
 */
function updateProductDisplay() {
  if (!selectedProduct) return;

  // Update color swatches
  displayColorSwatches(selectedProduct);

  // Update print area guides
  updatePrintAreaGuides();

  // Update size selector
  if (selectedVariant) {
    displaySizeSelector(selectedProduct, selectedVariant.color_name);
  }

  // Update mockup image if available
  if (selectedImageUrl) {
    updateMockupImage(selectedImageUrl);
  }

  // Check design completion
  checkDesignCompletion();
}

/**
 * Updates the design image position with boundary constraints
 * @param {number} deltaX - Change in X position
 * @param {number} deltaY - Change in Y position
 */
function updateDesignPosition(deltaX, deltaY) {
  if (!designImageContainer || !mockupImageOverlay) return;

  const guide = mockupImageOverlay.querySelector(".print-area-guide");
  if (!guide) return;

  const guideBounds = guide.getBoundingClientRect();
  const imageBounds = designImageContainer.getBoundingClientRect();

  // Calculate new position with print area constraints
  const newLeft = mockupState.dragStartX + deltaX;
  const newTop = mockupState.dragStartY + deltaY;

  // Apply print area constraints
  const maxLeft =
    guideBounds.right - imageBounds.width - PRINT_AREA.DEFAULT_MARGIN;
  const maxTop =
    guideBounds.bottom - imageBounds.height - PRINT_AREA.DEFAULT_MARGIN;
  const minLeft = guideBounds.left + PRINT_AREA.DEFAULT_MARGIN;
  const minTop = guideBounds.top + PRINT_AREA.DEFAULT_MARGIN;

  designState.position = {
    x: Math.max(minLeft, Math.min(maxLeft, newLeft)),
    y: Math.max(minTop, Math.min(maxTop, newTop)),
  };

  // Update element position
  designImageContainer.style.left = `${designState.position.x}px`;
  designImageContainer.style.top = `${designState.position.y}px`;

  // Save state
  saveDesignState();

  // Check design completion
  checkDesignCompletion();
}

/**
 * Updates the design image size with constraints
 * @param {number} width - New width in pixels
 * @param {number} height - New height in pixels
 */
function updateDesignSize(width, height) {
  if (!designImageContainer) return;

  // Calculate aspect ratio
  const aspectRatio =
    designState.originalSize.width / designState.originalSize.height;

  // Constrain size while maintaining aspect ratio
  let newWidth = Math.max(
    DESIGN_CONSTRAINTS.MIN_SIZE_PX,
    Math.min(DESIGN_CONSTRAINTS.MAX_SIZE_PX, width)
  );
  let newHeight = newWidth / aspectRatio;

  // Adjust if height exceeds constraints
  if (
    newHeight < DESIGN_CONSTRAINTS.MIN_SIZE_PX ||
    newHeight > DESIGN_CONSTRAINTS.MAX_SIZE_PX
  ) {
    newHeight = Math.max(
      DESIGN_CONSTRAINTS.MIN_SIZE_PX,
      Math.min(DESIGN_CONSTRAINTS.MAX_SIZE_PX, height)
    );
    newWidth = newHeight * aspectRatio;
  }

  // Update element size
  designImageContainer.style.width = `${newWidth}px`;
  designImageContainer.style.height = `${newHeight}px`;

  // Update scale based on original size
  designState.scale = newWidth / designState.originalSize.width;

  // Update scale slider if available
  if (imageScaleSlider) {
    imageScaleSlider.value = designState.scale;
  }

  // Save state
  saveDesignState();
}

/**
 * Updates the design image scale
 * @param {number} scale - New scale factor
 */
function updateDesignScale(scale) {
  if (!designImageContainer || !designState.originalSize.width) return;

  // Constrain scale
  const newScale = Math.max(
    DESIGN_CONSTRAINTS.MIN_SCALE,
    Math.min(DESIGN_CONSTRAINTS.MAX_SCALE, scale)
  );

  // Calculate new dimensions
  const newWidth = designState.originalSize.width * newScale;
  const newHeight = designState.originalSize.height * newScale;

  // Update size
  updateDesignSize(newWidth, newHeight);
}

/**
 * Updates the mockup image with the selected design
 * @param {string} imageUrl - URL of the design image
 */
function updateMockupImage(imageUrl) {
  if (!designImageContainer || !imageUrl) return;

  // Create new image to get original dimensions
  const img = new Image();
  img.onload = () => {
    // Store original size
    designState.originalSize = {
      width: img.width,
      height: img.height,
    };

    // Create design image element
    designImageContainer.innerHTML = `
      <img src="${imageUrl}" alt="Design" style="width: 100%; height: 100%;">
      <div class="resize-handle"></div>
    `;

    // Reset position and scale
    designState.position = {
      x: DESIGN_CONSTRAINTS.POSITION_MARGIN,
      y: DESIGN_CONSTRAINTS.POSITION_MARGIN,
    };
    designState.scale = 1.0;

    // Apply initial position and size
    designImageContainer.style.left = `${designState.position.x}px`;
    designImageContainer.style.top = `${designState.position.y}px`;
    updateDesignSize(img.width, img.height);

    // Show design container
    designImageContainer.style.display = "block";

    // Save state
    saveDesignState();

    // Update completion status
    checkDesignCompletion();
  };
  img.src = imageUrl;
}

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

  // Initialize Stripe (add null check)
  if (
    CONFIG.STRIPE_PUBLISHABLE_KEY &&
    CONFIG.STRIPE_PUBLISHABLE_KEY !== "pk_test_placeholder"
  ) {
    try {
      stripe = await loadStripe(CONFIG.STRIPE_PUBLISHABLE_KEY);
      if (!stripe) {
        throw new AppError(
          ErrorTypes.INITIALIZATION,
          "Stripe failed to initialize after load"
        );
      }
      console.log("Stripe initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Stripe:", error);
      // Only display message if the payment message element exists
      const paymentMsgEl = document.getElementById("payment-message");
      if (paymentMsgEl) {
        displayMessage(
          paymentMsgEl,
          "Stripe konnte nicht initialisiert werden. Zahlung nicht möglich.",
          "error"
        );
      }
      if (Sentry) {
        Sentry.captureException(error);
      }
      await captureErrorEvent(error, "stripe_initialization", {
        stripe_key_configured: !!CONFIG.STRIPE_PUBLISHABLE_KEY,
      });
    }
  } else {
    console.warn(
      "Stripe publishable key not configured. Stripe features disabled."
    );
  }

  // Initialize PostHog opt-out state (add null check for toggle)
  if (posthogOptOutToggle) {
    if (window.posthog && CONFIG.POSTHOG.API_KEY) {
      // Add check for API Key here too
      try {
        const hasOptedOut = await checkOptOutState();
        posthogOptOutToggle.checked = hasOptedOut;
        posthogOptOutToggle.addEventListener(
          "change",
          handlePostHogOptOutToggle
        );
      } catch (err) {
        console.error("Error initializing PostHog opt-out state:", err);
      }
    } else {
      console.warn(
        "PostHog not available or not configured. Analytics disabled."
      );
      posthogOptOutToggle.disabled = true;
    }
  } else {
    console.warn("PostHog opt-out toggle element not found.");
  }

  // --- Add Event Listeners (with null checks) ---
  // Null checks added/verified for all event listeners attached here

  if (imageUploadInput) {
    imageUploadInput.addEventListener("change", handleImageUpload);
  } else {
    console.warn("#image-upload-input not found");
  }

  if (imageUploadButton) {
    imageUploadButton.dataset.originalText = "Für Design Verwenden";
    imageUploadButton.textContent = "Für Design Verwenden";
    if (typeof handleUseUploadedImage === "function") {
      imageUploadButton.addEventListener("click", handleUseUploadedImage);
    } else {
      console.error("handleUseUploadedImage function is not defined!");
    }
  } else {
    console.warn("#image-upload-button not found.");
  }

  if (buyTokensButton) {
    // ADDED NULL CHECK
    buyTokensButton.addEventListener("click", async (e) => {
      e.preventDefault();
      await initiateTokenPurchase();
    });
  } else {
    console.warn("#buy-tokens-button not found"); // ADDED Warning
  }

  if (submitPaymentButton) {
    submitPaymentButton.addEventListener("click", async (e) => {
      e.preventDefault();
      await handlePaymentSubmit();
    });
  } else {
    console.warn("#submit-payment-button not found");
  }

  if (aiGenerateButton) {
    aiGenerateButton.addEventListener("click", handleGenerateImage);
  } else {
    console.warn("#ai-generate-button not found");
  }

  if (aiResultsGrid) {
    aiResultsGrid.addEventListener("click", handleAiImageSelection);
  } else {
    console.warn("#ai-results-grid not found");
  }

  if (productListDiv) {
    productListDiv.addEventListener("click", handleProductSelection);
  } else {
    console.warn("#product-list not found");
  }

  if (colorSwatchesDiv) {
    colorSwatchesDiv.addEventListener("click", handleColorSelection);
  } else {
    console.warn("#color-swatches not found");
  }

  if (tabButtons && tabContents) {
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.tab));
    });
  } else {
    console.warn("Tab buttons or contents not found");
  }

  if (sizeSelectorDiv) {
    sizeSelectorDiv.addEventListener("click", handleSizeSelection);
  } else {
    console.warn("#size-selector not found");
  }

  if (quantityInput) {
    quantityInput.addEventListener("change", handleQuantityChange);
  } else {
    console.warn("#quantity-input not found");
  }

  if (proceedToCheckoutButton) {
    proceedToCheckoutButton.addEventListener("click", handleProceedToCheckout);
  } else {
    console.warn("#proceed-to-checkout-button not found");
  }

  if (getShippingButton) {
    getShippingButton.addEventListener("click", handleGetShippingOptions);
  } else {
    console.warn("#get-shipping-button not found");
  }

  if (shippingOptionsListDiv) {
    shippingOptionsListDiv.addEventListener(
      "click",
      handleShippingOptionSelection
    );
  } else {
    console.warn("#shipping-options-list not found");
  }

  if (submitTshirtOrderButton) {
    submitTshirtOrderButton.addEventListener("click", handleSubmitTshirtOrder);
  } else {
    console.warn("#submit-tshirt-order-button not found");
  }

  if (recoveryRequestButton) {
    recoveryRequestButton.addEventListener("click", handleRecoveryRequest);
  } else {
    console.warn("#recovery-request-button not found");
  }

  if (designImageContainer) {
    designImageContainer.addEventListener("mousedown", handleMouseDown);
  } else {
    console.warn("#design-image-container not found");
  }

  // Add global mouse move/up listeners for dragging/resizing
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);

  if (imageScaleSlider) {
    imageScaleSlider.addEventListener("input", handleScaleSliderChange);
  } else {
    console.warn("#image-scale-slider not found");
  }

  if (navButtons) {
    navButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        const sectionId = e.target.getAttribute("data-section");
        if (sectionId) {
          showSection(sectionId);
        }
      });
    });
  } else {
    console.warn(".nav-button elements not found");
  }

  // --- Initial Setup Calls ---
  loadGrantId(); // Load grant ID first
  await updateTokenBalanceDisplay(); // Then update balance
  await fetchAndDisplayProducts();
  // Display initial section (e.g., design)
  showSection("design-section");

  // Restore design state if applicable
  restoreDesignState();
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

// Enhanced token management
function getTokenGrantId() {
  return localStorage.getItem("token_grant_id");
}

function saveTokenGrantId(grantId) {
  if (!grantId) {
    console.warn("Attempted to save invalid grant_id");
    return false;
  }
  localStorage.setItem("token_grant_id", grantId);
  return true;
}

async function fetchAndDisplayTokenBalance() {
  const grantId = getTokenGrantId();
  const balanceDisplay = document.getElementById("token-balance-display");

  if (!grantId) {
    balanceDisplay.textContent = "Tokens: 0";
    return 0;
  }

  try {
    const response = await makeApiCall(
      `/api/get-token-balance?grant_id=${encodeURIComponent(grantId)}`
    );
    const balance = response.tokens_remaining;

    balanceDisplay.textContent = `Tokens: ${balance}`;

    // Update UI elements based on balance
    const aiGenerateButton = document.getElementById("ai-generate-button");
    if (aiGenerateButton) {
      aiGenerateButton.disabled = balance <= 0;
      aiGenerateButton.title =
        balance <= 0 ? "Keine Tokens verfügbar" : "Generieren (1 Token)";
    }

    return balance;
  } catch (error) {
    await captureErrorEvent(error, "token_balance_check");
    balanceDisplay.textContent = "Tokens: Fehler";
    return 0;
  }
}

// Enhanced token purchase success handling
async function handleTokenPurchaseSuccess(grantId) {
  try {
    if (saveTokenGrantId(grantId)) {
      await captureAnalyticsEvent("token_purchase_completed", {
        grant_id: grantId,
      });

      // Display the grant ID to the user
      const grantIdDisplay = document.getElementById("grant-id-display");
      if (grantIdDisplay) {
        grantIdDisplay.innerHTML = `
          <h4>Deine Grant ID</h4>
          <p><strong>${grantId}</strong></p>
          <p class="warning">Wichtig: Speichere diese ID sicher! Sie wird benötigt, um deine Tokens zu nutzen.</p>
        `;
        grantIdDisplay.style.display = "block";
      }

      // Update token balance display
      await fetchAndDisplayTokenBalance();

      // Show success message
      displayMessage(
        document.getElementById("payment-message"),
        "Token-Kauf erfolgreich! Deine Grant ID wurde gespeichert.",
        "success"
      );
    }
  } catch (error) {
    await captureErrorEvent(error, "token_purchase_success_handling");
    throw error;
  }
}

// Enhanced token usage validation
async function validateTokenUsage() {
  const grantId = getTokenGrantId();
  if (!grantId) {
    displayMessage(
      document.getElementById("ai-status"),
      "Bitte kaufe zuerst Tokens, um die AI-Generierung zu nutzen.",
      "error"
    );
    return false;
  }

  const balance = await fetchAndDisplayTokenBalance();
  if (balance <= 0) {
    displayMessage(
      document.getElementById("ai-status"),
      "Keine Tokens verfügbar. Bitte kaufe neue Tokens.",
      "error"
    );
    return false;
  }

  return true;
}

// Update AI generation to use token validation
async function handleAiGenerate() {
  const generateButton = document.getElementById("ai-generate-button");
  const promptInput = document.getElementById("ai-prompt-input");
  const statusElement = document.getElementById("ai-status");

  try {
    setLoadingState(generateButton, true);

    if (!(await validateTokenUsage())) {
      return;
    }

    const prompt = promptInput.value.trim();
    if (!prompt) {
      displayMessage(statusElement, "Bitte gib einen Prompt ein.", "error");
      return;
    }

    // Capture analytics before API call
    await captureAnalyticsEvent("ai_prompt_submitted", {
      prompt_length: prompt.length,
    });

    // Make API call with grant_id
    const response = await makeApiCall("/api/generate-image", {
      method: "POST",
      body: JSON.stringify({
        prompt,
        grant_id: getTokenGrantId(),
      }),
    });

    // Handle successful generation
    displayAiResults(response.images);

    // Update token balance after successful generation
    await fetchAndDisplayTokenBalance();

    await captureAnalyticsEvent("ai_image_generated", {
      success: true,
      num_images: response.images.length,
    });
  } catch (error) {
    await captureErrorEvent(error, "ai_generation");
    displayMessage(
      statusElement,
      "Fehler bei der Bildgenerierung: " + error.message,
      "error"
    );
  } finally {
    setLoadingState(generateButton, false);
  }
}

async function handleAiImageSelection(event) {
  try {
    const imageUrl = event.target.src;
    // ... existing image selection logic ...

    await captureAnalyticsEvent("ai_image_selected", {
      selected_image_url: imageUrl,
    });

    displaySelectedImage(imageUrl);
  } catch (error) {
    await captureErrorEvent(error, "ai_image_selection");
    throw error;
  }
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

/**
 * Updates the variant display based on selected color and size
 * This function now correctly sets the selectedVariant object
 */
function updateVariantDisplay() {
  if (!selectedProduct || !selectedColorName || !selectedSize) {
    selectedVariant = null; // Reset if any part is missing
    console.log("Resetting selectedVariant due to missing product/color/size");
    return;
  }

  // Find the specific variant matching BOTH selected color name and size
  const matchedVariant = selectedProduct.variants?.find(
    (v) =>
      v.color === selectedColorName && v.size === selectedSize && v.in_stock
  );

  if (matchedVariant) {
    selectedVariant = matchedVariant;
    console.log("Selected Variant Updated:", selectedVariant);
    // Update any UI elements that depend directly on the variant ID if needed
    // e.g., display price if variant has specific price
  } else {
    selectedVariant = null; // Reset if no matching variant found
    console.warn(
      `No matching variant found for Color: ${selectedColorName}, Size: ${selectedSize}`
    );
    // Optionally display a message to the user
    displayMessage(
      document.getElementById("design-status"),
      `Größe ${selectedSize} ist für Farbe ${selectedColorName} nicht verfügbar.`,
      "error"
    );
  }
  // Always check completion after attempting to update variant
  checkDesignCompletion();
}

async function handleColorSelection(event) {
  const colorElement = event.target.closest(".color-swatch");
  if (!colorElement || !selectedProduct) return;

  // Clear previously selected swatch
  document
    .querySelectorAll(".color-swatch.selected")
    .forEach((el) => el.classList.remove("selected"));
  // Mark new swatch as selected
  colorElement.classList.add("selected");

  selectedColorName = colorElement.dataset.colorName; // Store selected color name
  selectedColorCode = colorElement.dataset.colorCode; // Store selected color code

  console.log("Color selected:", selectedColorName);

  await captureAnalyticsEvent("tshirt_color_selected", {
    product_id: selectedProduct?.id,
    color_name: selectedColorName,
    color_code: selectedColorCode,
  });

  // Update the size selector for the new color
  displaySizeSelector(selectedProduct, selectedColorName);
  // Attempt to update the variant (will reset size if needed)
  selectedSize = null; // Reset size when color changes
  updateVariantDisplay(); // This will update selectedVariant and call checkDesignCompletion

  // Update mockup visual background/base if needed (assuming a base image per product)
  // updateMockupBaseImage(selectedProduct.base_image_url, selectedColorCode);
}

// --- Phase 3 Helper Functions ---
function checkDesignCompletion() {
  // Now explicitly checks selectedVariant which is updated by updateVariantDisplay
  const isComplete =
    selectedProduct &&
    selectedVariant && // This is now reliably set or null
    selectedImageUrl &&
    quantityInput?.value >= 1 &&
    validateDesignPlacement(); // Add placement validation

  console.log("Checking Design Completion:", {
    selectedProduct: !!selectedProduct,
    selectedVariant: !!selectedVariant, // Log if variant is set
    selectedImageUrl: !!selectedImageUrl,
    quantity: quantityInput?.value,
    placementValid: validateDesignPlacement(), // Log placement validation result
  });

  if (proceedToCheckoutButton) {
    proceedToCheckoutButton.disabled = !isComplete;

    let message = "";
    if (!isComplete) {
      // Provide more specific feedback
      if (!selectedProduct) message = "Bitte wähle ein Produkt.";
      else if (!selectedColorName) message = "Bitte wähle eine Farbe.";
      else if (!selectedSize) message = "Bitte wähle eine Größe.";
      else if (!selectedVariant)
        message = `Die Größe ${selectedSize} ist für Farbe ${selectedColorName} nicht verfügbar.`;
      else if (!selectedImageUrl)
        message = "Bitte füge ein Design hinzu (Upload oder AI).";
      else if (!quantityInput?.value || quantityInput.value < 1)
        message = "Bitte gib eine Menge an.";
      else if (!validateDesignPlacement())
        message = "Dein Design liegt außerhalb des Druckbereichs.";
      else message = "Bitte vervollständige dein Design.";
    } else {
      message = "Design bereit für Checkout.";
    }

    displayMessage(
      document.getElementById("design-status"),
      message,
      isComplete ? "success" : "info" // Use info for incomplete steps
    );
  }

  return isComplete;
}

function showSection(sectionId) {
  const sections = document.querySelectorAll(".section");
  sections.forEach((section) => {
    section.style.display = section.id === sectionId ? "block" : "none";
  });

  // Update active state for nav buttons
  const navButtons = document.querySelectorAll(".nav-button");
  navButtons.forEach((button) => {
    if (button.dataset.target === sectionId) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
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
  if (!sizeElement || !selectedProduct || !selectedColorName) return;

  // Clear previously selected size
  document
    .querySelectorAll(".size-button.selected")
    .forEach((el) => el.classList.remove("selected"));
  // Mark new size as selected
  sizeElement.classList.add("selected");

  selectedSize = sizeElement.dataset.size; // Store selected size
  console.log("Size selected:", selectedSize);

  await captureAnalyticsEvent("tshirt_size_selected", {
    product_id: selectedProduct?.id,
    color_name: selectedColorName, // Include color context
    size: selectedSize,
  });

  // Attempt to update the variant with the selected size and current color
  updateVariantDisplay(); // This will update selectedVariant and call checkDesignCompletion
}

async function showCheckoutSection() {
  try {
    // ... existing checkout logic ...

    await captureAnalyticsEvent("checkout_started", {
      product_id: currentProduct.id,
      color: selectedColor,
      size: selectedSize,
      quantity: selectedQuantity,
    });

    // Continue with checkout flow
  } catch (error) {
    await captureErrorEvent(error, "checkout_initiation");
    throw error;
  }
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
  try {
    const optionId = event.target.dataset.shippingId;
    const option = shippingOptions.find((opt) => opt.id === optionId);
    // ... existing shipping selection logic ...

    await captureAnalyticsEvent("shipping_option_selected", {
      service_name: option.name,
      rate: option.rate,
    });

    // Continue with shipping selection
  } catch (error) {
    await captureErrorEvent(error, "shipping_option_selection");
    throw error;
  }
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

function handleMouseDown(e) {
  const designImageContainer = document.querySelector(
    ".design-image-container"
  );
  if (e.target.classList.contains("resize-handle")) {
    e.preventDefault();
    e.stopPropagation();
    mockupState.isResizing = true;
    mockupState.resizeStartX = e.clientX;
    mockupState.resizeStartY = e.clientY;
    mockupState.imageStartWidth = designImageContainer.offsetWidth;
    mockupState.imageStartHeight = designImageContainer.offsetHeight;
  } else if (e.target === designImageContainer) {
    e.preventDefault();
    mockupState.isDragging = true;
    designImageContainer.style.cursor = "grabbing";
    mockupState.dragStartX = e.clientX;
    mockupState.dragStartY = e.clientY;
    mockupState.imageStartLeft = designImageContainer.offsetLeft;
    mockupState.imageStartTop = designImageContainer.offsetTop;
  }
}

function handleMouseMove(e) {
  if (!mockupState.isDragging && !mockupState.isResizing) return;

  const mockup = document.getElementById("mockup-container");
  const designImageContainer = document.querySelector(
    ".design-image-container"
  );
  if (!mockup || !designImageContainer) return;

  if (mockupState.isDragging) {
    const deltaX = e.clientX - mockupState.dragStartX;
    const deltaY = e.clientY - mockupState.dragStartY;
    const newX = mockupState.imageStartLeft + deltaX;
    const newY = mockupState.imageStartTop + deltaY;

    updateDesignPosition(newX, newY);
    handleDesignCustomization("drag", {
      position_x: newX,
      position_y: newY,
    });
  }

  if (mockupState.isResizing) {
    const deltaX = e.clientX - mockupState.resizeStartX;
    const deltaY = e.clientY - mockupState.resizeStartY;
    const newWidth = Math.max(50, mockupState.imageStartWidth + deltaX);
    const newHeight = Math.max(50, mockupState.imageStartHeight + deltaY);

    updateDesignSize(newWidth, newHeight);
    handleDesignCustomization("resize", {
      width: newWidth,
      height: newHeight,
    });
  }
}

function handleMouseUp() {
  const designImageContainer = document.querySelector(
    ".design-image-container"
  );
  if (mockupState.isDragging) {
    mockupState.isDragging = false;
    if (designImageContainer) {
      designImageContainer.style.cursor = "grab";
    }
    checkDesignCompletion(); // Placement might affect completion
  }
  if (mockupState.isResizing) {
    mockupState.isResizing = false;
    checkDesignCompletion(); // Size might affect completion
  }
}

function handleScaleSlider() {
  const scale = parseFloat(imageScaleSlider.value);
  updateDesignScale(scale);
  handleDesignCustomization("scale", { scale_value: scale });
}

async function handleRecoveryRequest() {
  try {
    const email = recoveryEmailInput.value.trim();
    if (!email) {
      displayMessage(
        recoveryMessage,
        "Bitte E-Mail-Adresse eingeben.",
        "error"
      );
      return;
    }

    setLoadingState(recoveryRequestButton, true);
    displayMessage(recoveryMessage, "Suche nach Grant IDs...", "info");

    await captureAnalyticsEvent("grant_id_recovery_requested", {
      email_hash: await hashEmail(email), // Implement hashEmail function for privacy
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
    await captureErrorEvent(error, "grant_id_recovery");
  } finally {
    setLoadingState(recoveryRequestButton, false);
  }
}

// Helper function to hash email for analytics
async function hashEmail(email) {
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

/** Displays the list of fetched products */
function displayProducts(products) {
  productListDiv.innerHTML = ""; // Clear existing
  if (!products || products.length === 0) {
    productListDiv.innerHTML =
      "<p>Keine Produkte gefunden oder Fehler beim Laden.</p>";
    return;
  }
  products.forEach((product) => {
    const productDiv = document.createElement("div");
    productDiv.classList.add("product-item", "card");
    productDiv.dataset.productId = product.id;

    // Create a placeholder SVG as a data URL
    const placeholderSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">
        <rect width="50" height="50" fill="#eee"/>
        <text x="50%" y="50%" font-family="Arial" font-size="8" fill="#aaa" text-anchor="middle" dy=".3em">No Image</text>
      </svg>
    `)}`;

    // Safely get the image URL
    const imageUrl = product.default_image_url;
    let imageHtml = "";

    // Create image element with error handling
    imageHtml = `<img 
      src="${imageUrl || placeholderSvg}" 
      alt="${product.name}" 
      style="width: 50px; height: 50px; object-fit: cover; margin-right: 10px; vertical-align: middle; border-radius: 3px;"
      onerror="this.onerror=null; this.src='${placeholderSvg}';"
    >`;

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
  try {
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
    await captureErrorEvent(error, "token_purchase_initiation");
    throw error;
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

function initializeDesignControls() {
  const designContainer = document.querySelector(".design-container");
  const selectedDesign = document.getElementById("selected-design");
  const rotateLeftBtn = document.getElementById("rotate-left");
  const rotateRightBtn = document.getElementById("rotate-right");
  const resetPositionBtn = document.getElementById("reset-position");

  // Design interaction state
  let currentRotation = 0;
  let currentPosition = { x: 0, y: 0 };
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };

  function startDragging(e) {
    if (!e.target.closest(".design-container")) return;
    isDragging = true;
    dragStart = {
      x: e.clientX - currentPosition.x,
      y: e.clientY - currentPosition.y,
    };
  }

  function handleDragging(e) {
    if (!isDragging) return;
    e.preventDefault();

    currentPosition = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    };

    updateDesignTransform();
  }

  function stopDragging() {
    isDragging = false;
  }

  // Rotation controls
  rotateLeftBtn.addEventListener("click", () => {
    currentRotation = (currentRotation - 90) % 360;
    updateDesignTransform();
  });

  rotateRightBtn.addEventListener("click", () => {
    currentRotation = (currentRotation + 90) % 360;
    updateDesignTransform();
  });

  resetPositionBtn.addEventListener("click", () => {
    currentRotation = 0;
    currentPosition = { x: 0, y: 0 };
    updateDesignTransform();
  });

  // Drag functionality
  designContainer.addEventListener("mousedown", startDragging);
  document.addEventListener("mousemove", handleDragging);
  document.addEventListener("mouseup", stopDragging);

  // Touch support for design container
  designContainer.addEventListener("touchstart", handleTouchStart);
  document.addEventListener("touchmove", handleTouchMove);
  document.addEventListener("touchend", handleTouchEnd);

  function updateDesignTransform() {
    if (!selectedDesign) return;
    selectedDesign.style.transform = `
      translate(${currentPosition.x}px, ${currentPosition.y}px)
      rotate(${currentRotation}deg)
    `;
  }
}

function handleTouchStart(e) {
  if (!e.target.closest(".design-container")) return;
  const touch = e.touches[0];
  isDragging = true;
  dragStart = {
    x: touch.clientX - currentPosition.x,
    y: touch.clientY - currentPosition.y,
  };
}

function handleTouchMove(e) {
  if (!isDragging) return;
  e.preventDefault();

  const touch = e.touches[0];
  currentPosition = {
    x: touch.clientX - dragStart.x,
    y: touch.clientY - dragStart.y,
  };

  updateDesignTransform();
}

function handleTouchEnd() {
  isDragging = false;
}

// Update the displaySelectedImage function to work with the new design container
function displaySelectedImage(imageUrl) {
  const selectedDesign = document.getElementById("selected-design");
  selectedDesign.src = imageUrl;
  selectedDesign.style.display = "block";

  // Reset position and rotation
  currentRotation = 0;
  currentPosition = { x: 0, y: 0 };
  updateDesignTransform();
}

// Initialize design controls when the page loads
document.addEventListener("DOMContentLoaded", () => {
  initializeDesignControls();
});

// --- Ensure handleUseUploadedImage is defined ---
// Moved the function definition here to ensure it's declared before use
// (and ensure it's not nested inside another function like DOMContentLoaded)
/**
 * Handles the user's request to use an uploaded image
 * @async
 */
async function handleUseUploadedImage() {
  const fileInput = document.getElementById("image-upload-input");
  const uploadButton = document.getElementById("image-upload-button");
  const statusDisplay = document.getElementById("upload-status");
  const previewDisplay = document.getElementById("image-preview-upload");

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    displayMessage(
      statusDisplay,
      "Bitte wähle zuerst eine Datei aus.",
      "error"
    );
    return;
  }
  const file = fileInput.files[0];

  // Basic client-side validation
  const allowedTypes = ["image/png", "image/jpeg"];
  if (!allowedTypes.includes(file.type)) {
    displayMessage(
      statusDisplay,
      "Ungültiger Dateityp. Bitte PNG oder JPG hochladen.",
      "error"
    );
    return;
  }
  // Optional: Add size validation
  // const maxSizeMB = 5;
  // if (file.size > maxSizeMB * 1024 * 1024) {
  //     displayMessage(statusDisplay, `Datei zu groß (Max: ${maxSizeMB}MB).`, 'error');
  //     return;
  // }

  setLoadingState(uploadButton, true);
  displayMessage(statusDisplay, "Lade Bild hoch...", "info");

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
      (response) => response.url && typeof response.url === "string" // Validate response
    );

    const imageUrl = data.url;
    if (imageUrl) {
      selectedImageUrl = imageUrl; // Store the selected URL
      updateMockupImage(imageUrl); // Update the main mockup
      displayMessage(statusDisplay, "Bild erfolgreich hochgeladen.", "success");
      if (previewDisplay) {
        previewDisplay.innerHTML = `<img src="${imageUrl}" alt="Hochgeladenes Bild">`;
      }
      await captureAnalyticsEvent("image_upload_completed", {
        success: true,
        image_url: imageUrl,
      });
    } else {
      throw new AppError("No image URL returned from server", ErrorTypes.API);
    }
  } catch (error) {
    console.error("Image upload failed:", error);
    displayErrorMessage(statusDisplay, error); // Use centralized error display
    if (previewDisplay) previewDisplay.innerHTML = "";
    await captureErrorEvent(error, "image_upload", {
      file_type: file.type,
      file_size: file.size,
    });
  } finally {
    setLoadingState(uploadButton, false);
    // Don't clear file input automatically, user might want to re-try upload
    // if (fileInput) fileInput.value = "";
  }
}

// --- Other function definitions ---
// (Ensure switchTab and showSection are also defined correctly in the global scope or imported)

function switchTab(targetId) {
  // Find all tab buttons and content
  const buttons = document.querySelectorAll(".tab-button");
  const contents = document.querySelectorAll(".tab-content");

  // Remove active class from all buttons and content
  buttons.forEach((button) => button.classList.remove("active"));
  contents.forEach((content) => content.classList.remove("active"));

  // Add active class to the clicked button and corresponding content
  const targetButton = document.querySelector(
    `.tab-button[data-target="${targetId}"]`
  );
  const targetContent = document.getElementById(targetId);

  if (targetButton) {
    targetButton.classList.add("active");
  }
  if (targetContent) {
    targetContent.classList.add("active");
  } else {
    console.error(`Tab content with ID '${targetId}' not found.`);
  }

  // Capture tab switch event
  captureAnalyticsEvent("tab_switched", { tab_id: targetId });
}

// Removing duplicate showSection function here
// function showSection was already defined earlier
