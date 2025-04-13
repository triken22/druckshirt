console.log("DruckMeinShirt frontend loaded!");

// PostHog Initialization (placeholder)
import posthog from "posthog-js";
posthog.init("phc_8ipgZfvHLUHGZ6J8b9AlkviiEzib4c77qhN69T9x4pK", {
  api_host: "https://us.i.posthog.com",
  person_profiles: "identified_only",
});

// TODO: Implement frontend logic
// - Image Upload Handling
// - AI Prompt Input & Display
// - Mockup Canvas Interaction
// - Token Purchase Flow
// - T-Shirt Ordering Flow
// - API calls to backend worker

// Configuration (Replace with your actual keys or use environment variables)
// TODO: Replace with your actual Stripe Publishable Key
const STRIPE_PUBLISHABLE_KEY =
  "pk_test_51MuCKzEmVs0WNShEf8Qr8WIpu275tgCkv1jtyHq90IsHNMmKMSjcVD1bm5GYgRvqeceAmtUSzUGKXJdg85y2OV0C00apBVxzES";
// --- PostHog Config ---
// TODO: Replace with environment variables injected during build/deployment
const POSTHOG_API_KEY = "phc_8ipgZfvHLUHGZ6J8b9AlkviiEzib4c77qhN69T9x4pK"; // Set via env: e.g., import.meta.env.VITE_POSTHOG_API_KEY
const POSTHOG_HOST_URL = "https://us.i.posthog.com"; // Or your self-hosted instance
// --- End PostHog Config ---

// Constants
const API_BASE_URL = "/api"; // Assuming backend is served from the same origin
const TOKEN_BUNDLE_ID = "bundle_10_tokens"; // Example bundle ID
const TOKEN_PRICE_EUR = 5; // Example price

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

// --- Stripe Variables ---
let stripe = null;
let paymentElement = null;
let currentClientSecret = null;
let currentGrantId = null;

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
  if (STRIPE_PUBLISHABLE_KEY === "pk_test_YOUR_KEY_HERE") {
    console.warn(
      "Stripe Publishable Key not set. Token purchase will not work."
    );
    displayMessage(paymentMessage, "Stripe ist nicht konfiguriert.", "error");
    buyTokensButton.disabled = true;
  } else {
    try {
      stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
    } catch (error) {
      console.error("Error loading Stripe:", error);
      displayMessage(paymentMessage, "Fehler beim Laden von Stripe.", "error");
      buyTokensButton.disabled = true;
    }
  }

  // Initialize PostHog (Optional - Placeholder for now)
  if (POSTHOG_API_KEY) {
    posthog.init(POSTHOG_API_KEY, {
      api_host: POSTHOG_HOST_URL,
      // TODO: Implement user opt-out check here if needed
      loaded: function (posthog) {
        if (userHasOptedOut()) {
          posthog.opt_out_capturing();
        }
      },
    });
    console.log("PostHog initialized.");
  } else {
    console.warn("PostHog API Key not set. Analytics disabled.");
  }

  // --- PostHog Opt-Out Handling ---
  // Check initial opt-out state AFTER PostHog is loaded (snippet handles init)
  // Use a small delay or a more robust check if needed
  setTimeout(() => {
    if (
      window.posthog &&
      typeof window.posthog.has_opted_out_capturing === "function"
    ) {
      const hasOptedOut = window.posthog.has_opted_out_capturing();
      posthogOptOutToggle.checked = hasOptedOut;
      console.log("Initial PostHog opt-out state:", hasOptedOut);
    } else {
      console.warn("PostHog not fully loaded yet for opt-out check.");
      // Optionally retry check later
    }
  }, 500); // Delay slightly to ensure snippet has likely run

  // Add listener for the toggle
  if (posthogOptOutToggle) {
    posthogOptOutToggle.addEventListener("change", handlePostHogOptOutToggle);
  }
  // --- End PostHog Opt-Out ---

  // Add Event Listeners
  if (imageUploadButton) {
    imageUploadButton.dataset.originalText = "Für Design Verwenden";
    imageUploadButton.textContent = "Für Design Verwenden";
    imageUploadButton.addEventListener("click", handleUseUploadedImage);
  }
  if (buyTokensButton) {
    buyTokensButton.addEventListener("click", initiateTokenPurchase);
  }
  if (submitPaymentButton) {
    submitPaymentButton.addEventListener("click", handleTokenPaymentSubmit);
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
  element.textContent = message;
  element.style.color =
    type === "error" ? "red" : type === "success" ? "green" : "black";
}

function setLoadingState(button, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading
    ? "Verarbeite..."
    : button.dataset.originalText || button.textContent;
  if (!isLoading && button.dataset.originalText) {
    delete button.dataset.originalText;
  }
}

function getTokenGrantId() {
  return localStorage.getItem("druckmeinshirt_grant_id");
}

function saveTokenGrantId(grantId) {
  localStorage.setItem("druckmeinshirt_grant_id", grantId);
}

// --- PostHog Opt-Out Handler ---
function handlePostHogOptOutToggle() {
  if (!window.posthog) {
    console.error("PostHog is not available.");
    return;
  }
  if (posthogOptOutToggle.checked) {
    window.posthog.opt_out_capturing();
    console.log("PostHog capturing opted OUT.");
  } else {
    window.posthog.opt_in_capturing();
    console.log("PostHog capturing opted IN.");
  }
}

// --- Core Logic ---
async function fetchAndDisplayTokenBalance() {
  const grantId = getTokenGrantId();
  if (!grantId) {
    displayMessage(tokenBalanceDisplay, "Tokens: 0 (Keine Grant ID)", "info");
    return;
  }

  displayMessage(tokenBalanceDisplay, "Tokens: Prüfe...", "info");
  try {
    const response = await fetch(
      `${API_BASE_URL}/get-token-balance?grant_id=${grantId}`
    );
    if (!response.ok) {
      if (response.status === 404) {
        displayMessage(tokenBalanceDisplay, "Tokens: 0 (Ungültige ID)", "info");
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } else {
      const data = await response.json();
      displayMessage(
        tokenBalanceDisplay,
        `Tokens: ${data.tokens_remaining}`,
        "info"
      );
    }
  } catch (error) {
    console.error("Error fetching token balance:", error);
    displayMessage(tokenBalanceDisplay, "Tokens: Fehler", "error");
  }
}

async function handleUseUploadedImage() {
  if (
    !imageUploadInput ||
    !imageUploadInput.files ||
    imageUploadInput.files.length === 0
  ) {
    displayMessage(uploadStatus, "Bitte wähle zuerst ein Bild aus.", "error");
    return;
  }
  const file = imageUploadInput.files[0];

  // Display preview immediately
  const reader = new FileReader();
  reader.onload = (e) => {
    imagePreviewUpload.innerHTML = `<img src="${e.target.result}" alt="Upload Vorschau">`;
  };
  reader.readAsDataURL(file);

  // Actual upload happens when user confirms
  displayMessage(uploadStatus, "Lade Bild hoch, um es zu verwenden...", "info");
  setLoadingState(imageUploadButton, true);

  const formData = new FormData();
  formData.append("image", file);

  fetch(`${API_BASE_URL}/upload-image`, {
    method: "POST",
    body: formData,
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      displayMessage(
        uploadStatus,
        "Upload erfolgreich! Bild wird in Vorschau geladen.",
        "success"
      );
      updateMockupImage(data.imageUrl);
      // --- PostHog Event ---
      if (window.posthog)
        window.posthog.capture("image_uploaded", {
          file_type: file.type,
          file_size: file.size,
        });
    })
    .catch((error) => {
      console.error("Error uploading image:", error);
      displayMessage(
        uploadStatus,
        `Upload fehlgeschlagen: ${error.message}`,
        "error"
      );
      imagePreviewUpload.innerHTML = ""; // Clear preview on error
    })
    .finally(() => {
      setLoadingState(imageUploadButton, false);
    });
}

async function initiateTokenPurchase() {
  const email = emailInput.value;
  if (!email || !email.includes("@")) {
    // Basic email validation
    displayMessage(
      paymentMessage,
      "Bitte gib eine gültige Email-Adresse ein.",
      "error"
    );
    return;
  }
  if (!stripe) {
    displayMessage(paymentMessage, "Stripe ist nicht initialisiert.", "error");
    return;
  }

  displayMessage(paymentMessage, "Initialisiere Zahlung...", "info");
  setLoadingState(buyTokensButton, true);
  grantIdDisplay.textContent = ""; // Clear previous grant ID

  try {
    const response = await fetch(
      `${API_BASE_URL}/stripe/create-token-purchase-intent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bundle_id: TOKEN_BUNDLE_ID, email: email }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    currentClientSecret = data.client_secret;
    currentGrantId = data.grant_id; // Store temporarily

    // Mount Stripe Payment Element
    if (paymentElement) {
      paymentElement.destroy(); // Destroy previous instance if exists
    }
    const elements = stripe.elements({ clientSecret: currentClientSecret });
    paymentElement = elements.create("payment");
    paymentElement.mount("#payment-element-container");

    displayMessage(
      paymentMessage,
      "Bitte gib deine Zahlungsdaten ein.",
      "info"
    );
    submitPaymentButton.style.display = "block"; // Show payment button
    // --- PostHog Event ---
    if (window.posthog)
      window.posthog.capture("token_purchase_initiated", {
        bundle_id: TOKEN_BUNDLE_ID,
      });
  } catch (error) {
    console.error("Error initiating token purchase:", error);
    displayMessage(paymentMessage, `Fehler: ${error.message}`, "error");
  } finally {
    setLoadingState(buyTokensButton, false);
  }
}

async function handleTokenPaymentSubmit() {
  if (!stripe || !paymentElement || !currentClientSecret || !currentGrantId) {
    displayMessage(paymentMessage, "Zahlungselement nicht bereit.", "error");
    return;
  }

  setLoadingState(submitPaymentButton, true);
  displayMessage(paymentMessage, "Verarbeite Zahlung...", "info");

  try {
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements: paymentElement, // Use the mounted PaymentElement
      confirmParams: {
        // Return URL is not strictly necessary for this simple flow,
        // but might be useful for more complex scenarios.
        // return_url: window.location.href,
      },
      redirect: "if_required", // Don't redirect unless required by payment method
    });

    if (error) {
      // This point will only be reached if there is an immediate error when
      // confirming the payment. Otherwise, your customer will be redirected to
      // the `return_url`. For some payment methods like iDEAL, your customer will
      // be redirected to an intermediate site first to authorize the payment, then
      // redirected to the `return_url`.
      if (error.type === "card_error" || error.type === "validation_error") {
        displayMessage(paymentMessage, error.message, "error");
      } else {
        displayMessage(
          paymentMessage,
          "Ein unerwarteter Fehler ist aufgetreten.",
          "error"
        );
        console.error("Stripe confirmPayment error:", error);
      }
      setLoadingState(submitPaymentButton, false);
      return;
    }

    // Handle successful payment (or requires_action)
    if (paymentIntent.status === "succeeded") {
      displayMessage(
        paymentMessage,
        "Zahlung erfolgreich! Dein Grant ID wird angezeigt.",
        "success"
      );
      saveTokenGrantId(currentGrantId); // Save Grant ID to localStorage
      grantIdDisplay.innerHTML = `Dein Grant ID (bitte sicher aufbewahren): <code>${currentGrantId}</code> (wird auch per Email gesendet)`;
      await fetchAndDisplayTokenBalance(); // Update balance display
      submitPaymentButton.style.display = "none"; // Hide payment button
      if (paymentElement) paymentElement.destroy(); // Clean up element
      paymentElementContainer.innerHTML = ""; // Clear container
      // --- PostHog Event ---
      if (window.posthog)
        window.posthog.capture("token_purchase_completed", {
          bundle_id: TOKEN_BUNDLE_ID,
          grant_id: currentGrantId,
        });
    } else if (paymentIntent.status === "requires_action") {
      displayMessage(
        paymentMessage,
        "Weitere Aktion zur Bestätigung der Zahlung erforderlich.",
        "info"
      );
      // Stripe.js automatically handles required actions like 3D Secure
    } else {
      displayMessage(
        paymentMessage,
        `Zahlungsstatus: ${paymentIntent.status}`,
        "info"
      );
      console.warn("Unexpected payment intent status:", paymentIntent.status);
    }
  } catch (error) {
    console.error("Error processing payment:", error);
    displayMessage(
      paymentMessage,
      "Fehler bei der Zahlungsabwicklung.",
      "error"
    );
  } finally {
    // Only hide loading state if not succeeded (as the button is hidden on success)
    if (submitPaymentButton.style.display !== "none") {
      setLoadingState(submitPaymentButton, false);
    }
  }
}

// --- Load Stripe Async ---
// Defined separately for clarity, called in DOMContentLoaded
async function loadStripe(key) {
  // This relies on the Stripe.js script being loaded in index.html
  if (typeof Stripe === "undefined") {
    throw new Error("Stripe.js script not loaded");
  }
  return Stripe(key);
}

// --- Phase 2 Helper Functions ---
function switchTab(targetId) {
  tabContents.forEach((content) => {
    content.classList.toggle("active", content.id === targetId);
  });
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.target === targetId);
  });
}

function updateMockupImage(imageUrl) {
  selectedImageUrl = imageUrl;
  if (mockupImageOverlay) {
    mockupImageOverlay.src = imageUrl;
    mockupImageOverlay.style.display = imageUrl ? "block" : "none";
    // Reset scale and position when new image is loaded
    designImageContainer.style.width = "40%"; // Reset width
    designImageContainer.style.left = "30%";
    designImageContainer.style.top = "25%";
    imageScaleSlider.value = 1; // Reset slider
  }
  checkDesignCompletion();
}

// --- Phase 2 Core Logic ---
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
    // Optional: Highlight token purchase section or show modal
    return;
  }

  displayMessage(aiStatus, "Generiere Bilder... (kostet 1 Token)", "info");
  setLoadingState(aiGenerateButton, true);
  aiResultsGrid.innerHTML = ""; // Clear previous results
  imagePreviewAi.innerHTML = ""; // Clear selection preview

  // --- PostHog Event ---
  if (window.posthog)
    window.posthog.capture("ai_prompt_submitted", {
      prompt_length: prompt.length,
    });

  try {
    const response = await fetch(`${API_BASE_URL}/generate-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt, grant_id: grantId }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 402) {
        displayMessage(aiStatus, "Nicht genügend Tokens vorhanden.", "error");
      } else {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
    } else if (data.images && data.images.length > 0) {
      displayMessage(
        aiStatus,
        "Generierung erfolgreich! Wähle ein Bild.",
        "success"
      );
      data.images.forEach((imageUrl) => {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = "Generiertes AI Bild";
        img.dataset.imageUrl = imageUrl; // Store URL for selection
        aiResultsGrid.appendChild(img);
      });
      // Update token balance display after successful generation
      fetchAndDisplayTokenBalance();
      // --- PostHog Event ---
      if (window.posthog)
        window.posthog.capture("ai_image_generated", {
          num_images_returned: data.images.length,
        });
    } else {
      displayMessage(aiStatus, "Keine Bilder vom Server erhalten.", "error");
    }
  } catch (error) {
    console.error("Error generating AI image:", error);
    displayMessage(
      aiStatus,
      `Fehler bei der Generierung: ${error.message}`,
      "error"
    );
  } finally {
    setLoadingState(aiGenerateButton, false);
  }
}

function handleAiImageSelection(event) {
  if (event.target.tagName === "IMG" && event.target.dataset.imageUrl) {
    const selectedUrl = event.target.dataset.imageUrl;
    // Visually indicate selection
    aiResultsGrid
      .querySelectorAll("img")
      .forEach((img) => img.classList.remove("selected"));
    event.target.classList.add("selected");
    // Show preview and update mockup
    imagePreviewAi.innerHTML = `<img src="${selectedUrl}" alt="Ausgewähltes AI Bild">`;
    updateMockupImage(selectedUrl);
    displayMessage(aiStatus, "AI Bild ausgewählt.", "success");
    // --- PostHog Event ---
    if (window.posthog)
      window.posthog.capture("ai_image_selected", { image_source: "ai" });
  }
}

async function fetchAndDisplayProducts() {
  if (!productListDiv) return;
  productListDiv.innerHTML = "<p>Lade T-Shirt Produkte...</p>";
  try {
    // Assume the backend endpoint returns products including placement details now
    const response = await fetch(`${API_BASE_URL}/printful/products`);
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
  }
}

function handleProductSelection(event) {
  const targetItem = event.target.closest(".product-item");
  if (!targetItem || !targetItem.dataset.productId) return;

  const productId = parseInt(targetItem.dataset.productId, 10);
  selectedProduct = availableProducts.find((p) => p.id === productId);

  if (selectedProduct) {
    productListDiv
      .querySelectorAll(".product-item")
      .forEach((item) => item.classList.remove("selected"));
    targetItem.classList.add("selected");

    // --- Update Mockup Background ---
    const mockupBg = document.getElementById("mockup-background");
    if (mockupBg && selectedProduct.default_image_url) {
      // Set background image to the product's default image
      mockupBg.style.backgroundImage = `url('${selectedProduct.default_image_url}')`;
      mockupBg.style.backgroundColor = "transparent"; // Clear bg color if image is set
      console.log(
        "Set mockup background to product default:",
        selectedProduct.default_image_url
      );
    } else if (mockupBg) {
      mockupBg.style.backgroundImage = "none"; // Clear image if none provided
      mockupBg.style.backgroundColor = "#ccc"; // Fallback color
      console.log("Cleared mockup background, using fallback color.");
    }
    // --- End Update Mockup Background ---

    displayColorSwatches(selectedProduct);
    sizeSelectorDiv.innerHTML = "<p>Wähle zuerst Farbe.</p>";
    selectedVariant = null;
    selectedSize = null;
    displayMessage(
      document.getElementById("design-status"),
      `${selectedProduct.name} ausgewählt.`,
      "info"
    );
    checkDesignCompletion();
    // --- PostHog Event ---
    if (window.posthog)
      window.posthog.capture("product_selected", {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
      });
  } else {
    console.error("Selected product not found in availableProducts");
  }
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

function handleColorSelection(event) {
  const targetSwatch = event.target.closest(".color-swatch");
  if (!targetSwatch || !targetSwatch.dataset.colorCode || !selectedProduct)
    return;

  const colorCode = targetSwatch.dataset.colorCode;
  const colorName = targetSwatch.dataset.colorName;

  colorSwatchesDiv
    .querySelectorAll(".color-swatch")
    .forEach((swatch) => swatch.classList.remove("selected"));
  targetSwatch.classList.add("selected");

  selectedVariant = { color: colorName, color_code: colorCode }; // Basic info

  // --- Update Mockup Background ---
  const mockupBg = document.getElementById("mockup-background");
  if (mockupBg) {
    // Find the specific variant data from the fully populated product data
    const matchingVariant = selectedProduct.variants?.find(
      (v) => v.color === colorName && v.size === selectedSize
    ); // Use selectedSize if available, or find first match?
    // Let's refine: Find the base variant info for the color first.
    const firstVariantOfColor = selectedProduct.variants?.find(
      (v) => v.color === colorName
    );
    const variantImageUrl = firstVariantOfColor?.image_url; // Use the image URL provided by backend

    if (variantImageUrl) {
      mockupBg.style.backgroundImage = `url('${variantImageUrl}')`;
      mockupBg.style.backgroundColor = "transparent";
      console.log("Set mockup background to variant image:", variantImageUrl);
    } else if (selectedProduct.default_image_url) {
      // Fallback to product default image if no specific variant image found
      mockupBg.style.backgroundImage = `url('${selectedProduct.default_image_url}')`;
      mockupBg.style.backgroundColor = "transparent";
      console.log(
        "Set mockup background to product default (variant fallback):",
        selectedProduct.default_image_url
      );
    } else {
      // Final fallback: use selected color code AND clear image
      // This might be less ideal than showing the default placeholder again?
      // Let's try reverting to placeholder if no other images found.
      const placeholderUrl = "./src/assets/placeholder-tshirt.png"; // Ensure path is correct
      mockupBg.style.backgroundImage = `url('${placeholderUrl}')`;
      mockupBg.style.backgroundColor = colorCode; // Keep color hint
      console.log(
        "Could not find product/variant image, showing placeholder with color hint:",
        colorCode
      );
    }
  }
  // --- End Update Mockup Background ---

  // Fetch and display sizes for the selected color
  displaySizeSelector(selectedProduct, colorName);
  selectedSize = null; // Reset size selection when color changes
  displayMessage(
    document.getElementById("design-status"),
    `Farbe ${colorName} ausgewählt.`,
    "info"
  );
  checkDesignCompletion();
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
  document.querySelectorAll("main > section").forEach((section) => {
    section.style.display = section.id === sectionId ? "block" : "none";
  });
  // TODO: Update nav button active state if needed
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
          area_width: parseFloat(area_width_inches.toFixed(4)),
          area_height: parseFloat(area_height_inches.toFixed(4)),

          // Design dimensions in INCHES
          width: parseFloat(design_width_inches.toFixed(4)),
          height: parseFloat(design_height_inches.toFixed(4)),

          // Design offset in INCHES from top-left of print area
          top: parseFloat(design_top_inches.toFixed(4)),
          left: parseFloat(design_left_inches.toFixed(4)),
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

function handleSizeSelection(event) {
  const targetButton = event.target.closest(".size-button");
  if (
    !targetButton ||
    !targetButton.dataset.size ||
    !selectedProduct ||
    !selectedVariant
  )
    return;

  selectedSize = targetButton.dataset.size;

  // Find the specific variant ID based on product, color, and size
  const variant = selectedProduct.variants.find(
    (v) => v.color === selectedVariant.color && v.size === selectedSize
  );

  if (variant) {
    selectedVariant.id = variant.id; // Store the crucial catalog_variant_id
    // Visually indicate selection
    sizeSelectorDiv
      .querySelectorAll(".size-button")
      .forEach((btn) => btn.classList.remove("selected"));
    targetButton.classList.add("selected");
    displayMessage(
      document.getElementById("design-status"),
      `Größe ${selectedSize} ausgewählt.`,
      "info"
    );
    // --- PostHog Event ---
    if (window.posthog)
      window.posthog.capture("tshirt_size_selected", {
        product_id: selectedProduct.id,
        variant_id: selectedVariant.id,
        size: selectedSize,
      });
  } else {
    console.error("Could not find matching variant ID for selection");
    selectedSize = null;
    displayMessage(
      document.getElementById("design-status"),
      "Fehler: Passende Variante nicht gefunden.",
      "error"
    );
  }
  checkDesignCompletion();
}

function showCheckoutSection() {
  if (!checkDesignCompletion()) return; // Should be disabled, but double-check

  // Populate Order Summary
  const quantity = quantityInput.value;
  orderSummaryDiv.innerHTML = `
    <h4>Bestellübersicht</h4>
    <p>Produkt: ${selectedProduct.name}</p>
    <p>Farbe: ${selectedVariant.color}</p>
    <p>Größe: ${selectedSize}</p>
    <p>Menge: ${quantity}</p>
    <img src="${selectedImageUrl}" alt="Design" style="max-width: 100px; margin-top: 0.5rem;">
    <p><strong>Preis:</strong> Wird nach Versandoptionen berechnet.</p>
  `;

  // Show the checkout section
  showSection("checkout-section");

  // Reset shipping/payment sections within checkout
  shippingOptionsContainer.style.display = "none";
  tshirtPaymentContainer.style.display = "none";
  shippingOptionsListDiv.innerHTML = "";
  if (tshirtPaymentElement) tshirtPaymentElement.destroy(); // Clean up previous element
  tshirtPaymentElementContainer.innerHTML = "";
  displayMessage(shippingStatusDiv, "");
  displayMessage(tshirtPaymentMessage, "");
  document.getElementById("order-confirmation-message").innerHTML = "";
  document.getElementById("shipping-form").style.display = "block"; // Ensure form is visible
  // --- PostHog Event ---
  if (window.posthog) window.posthog.capture("checkout_started");
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
      quantity: parseInt(quantityInput.value, 10),
    },
  ];

  displayMessage(shippingStatusDiv, "Suche Versandoptionen...", "info");
  setLoadingState(getShippingButton, true);
  shippingOptionsContainer.style.display = "block";
  shippingOptionsListDiv.innerHTML = "";
  tshirtPaymentContainer.style.display = "none";
  selectedShippingOption = null;

  try {
    const response = await fetch(`${API_BASE_URL}/printful/shipping-options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient, items }),
    });
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
      div.dataset.optionId = option.id;
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
  } finally {
    setLoadingState(getShippingButton, false);
  }
}

function handleShippingOptionSelection(event) {
  const targetOption = event.target.closest(".shipping-option");
  if (!targetOption || !targetOption.dataset.optionId) return;

  const optionId = targetOption.dataset.optionId;
  selectedShippingOption = shippingOptions.find((opt) => opt.id === optionId);

  if (selectedShippingOption) {
    shippingOptionsListDiv
      .querySelectorAll(".shipping-option")
      .forEach((opt) => opt.classList.remove("selected"));
    targetOption.classList.add("selected");
    displayMessage(
      shippingStatusDiv,
      `Versandart ausgewählt: ${selectedShippingOption.name}`,
      "success"
    );
    initiateTshirtPayment();
    // --- PostHog Event ---
    if (window.posthog)
      window.posthog.capture("shipping_option_selected", {
        service_id: selectedShippingOption.id,
        service_name: selectedShippingOption.name,
        rate: selectedShippingOption.rate,
      });
  } else {
    console.error("Selected shipping option not found");
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
        quantity: parseInt(quantityInput.value, 10),
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
      `${API_BASE_URL}/stripe/create-tshirt-order-intent`,
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
    tshirtPaymentContainer.style.display = "none";
  }
}

async function handleSubmitTshirtOrder() {
  if (!stripe || !tshirtPaymentElement || !tshirtClientSecret) {
    displayMessage(
      tshirtPaymentMessage,
      "Zahlungselement nicht bereit.",
      "error"
    );
    return;
  }

  setLoadingState(submitTshirtOrderButton, true);
  displayMessage(tshirtPaymentMessage, "Verarbeite Zahlung...", "info");
  let paymentIntentStatus = null; // Track status for finally block

  try {
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements: tshirtPaymentElement,
      confirmParams: {
        /* return_url: `${window.location.origin}/order-confirmation` */
      },
      redirect: "if_required",
    });

    if (error) {
      if (error.type === "card_error" || error.type === "validation_error") {
        displayMessage(tshirtPaymentMessage, error.message, "error");
      } else {
        displayMessage(
          tshirtPaymentMessage,
          "Ein unerwarteter Fehler ist aufgetreten.",
          "error"
        );
        console.error("Stripe confirmPayment error (T-Shirt):", error);
      }
      setLoadingState(submitTshirtOrderButton, false);
      return;
    }

    paymentIntentStatus = paymentIntent.status;
    // Handle successful payment
    if (paymentIntent.status === "succeeded") {
      displayMessage(
        tshirtPaymentMessage,
        "Zahlung erfolgreich! Bestellung wird verarbeitet.",
        "success"
      );
      document.getElementById(
        "order-confirmation-message"
      ).innerHTML = `<h4>Vielen Dank für deine Bestellung!</h4><p>Eine Bestätigung wird in Kürze an ${shippingEmailInput.value} gesendet.</p>`;
      // Disable forms, hide payment element etc.
      shippingForm.style.display = "none";
      shippingOptionsContainer.style.display = "none";
      tshirtPaymentContainer.style.display = "none";
      // --- PostHog Event ---
      if (window.posthog)
        window.posthog.capture("tshirt_order_completed", {
          product_id: selectedProduct?.id,
          variant_id: selectedVariant?.id,
          shipping_country: shippingCountrySelect?.value,
        });
    } else if (paymentIntent.status === "requires_action") {
      displayMessage(
        tshirtPaymentMessage,
        "Weitere Aktion zur Bestätigung der Zahlung erforderlich.",
        "info"
      );
      // Need to keep loading state potentially
      setLoadingState(submitTshirtOrderButton, false); // Reset loading state here as action is needed
    } else {
      displayMessage(
        tshirtPaymentMessage,
        `Zahlungsstatus: ${paymentIntent.status}`,
        "info"
      );
      setLoadingState(submitTshirtOrderButton, false);
    }
  } catch (error) {
    console.error("Error processing T-Shirt payment:", error);
    displayMessage(
      tshirtPaymentMessage,
      "Fehler bei der Zahlungsabwicklung.",
      "error"
    );
    setLoadingState(submitTshirtOrderButton, false);
  } finally {
    // Keep button enabled if payment didn't succeed definitively
    if (paymentIntentStatus !== "succeeded") {
      setLoadingState(submitTshirtOrderButton, false);
    }
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
  if (isDragging) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    let newLeft = imageStartLeft + dx;
    let newTop = imageStartTop + dy;

    // Basic boundary checks (relative to parent)
    const parent = designImageContainer.parentElement;
    newLeft = Math.max(
      0,
      Math.min(newLeft, parent.offsetWidth - designImageContainer.offsetWidth)
    );
    newTop = Math.max(
      0,
      Math.min(newTop, parent.offsetHeight - designImageContainer.offsetHeight)
    );

    designImageContainer.style.left = `${newLeft}px`;
    designImageContainer.style.top = `${newTop}px`;
  } else if (isResizing) {
    const dx = e.clientX - resizeStartX;
    const scaleFactor = (imageStartWidth + dx) / imageStartWidth;

    let newWidth = imageStartWidth * scaleFactor;
    const parentWidth = designImageContainer.parentElement.offsetWidth;
    const minWidth = 50; // Minimum pixel width
    newWidth = Math.max(minWidth, Math.min(newWidth, parentWidth)); // Max width is parent width

    designImageContainer.style.width = `${newWidth}px`;

    // Update slider to reflect manual resize
    const maxSlider = parseFloat(imageScaleSlider.max);
    const minSlider = parseFloat(imageScaleSlider.min);
    const initialWidthRatio = 0.4;
    const currentWidthRatio = newWidth / parentWidth;
    const sliderValue = currentWidthRatio / initialWidthRatio;
    if (imageScaleSlider)
      imageScaleSlider.value = Math.max(
        minSlider,
        Math.min(sliderValue, maxSlider)
      );
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
  if (!imageScaleSlider || !designImageContainer) return;
  const scaleValue = parseFloat(imageScaleSlider.value);
  const initialWidthPercent = 40; // The initial width set in CSS/HTML
  const newWidthPercent = initialWidthPercent * scaleValue;
  designImageContainer.style.width = `${newWidthPercent}%`;
  checkDesignCompletion();
}

async function handleRecoveryRequest() {
  const email = recoveryEmailInput.value;
  if (!email) {
    displayMessage(
      recoveryMessageDiv,
      "Bitte gib deine Email-Adresse ein.",
      "error"
    );
    return;
  }

  displayMessage(
    recoveryMessageDiv,
    "Bitte warte, während wir deine Bestätigung senden...",
    "info"
  );
  setLoadingState(recoveryRequestButton, true);

  try {
    const response = await fetch(`${API_BASE_URL}/recovery-request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    displayMessage(
      recoveryMessageDiv,
      "Bestätigung wurde erfolgreich gesendet!",
      "success"
    );
    // --- PostHog Event ---
    if (window.posthog)
      window.posthog.capture("grant_id_recovery_requested", {
        email_provided: !!email,
      });
  } catch (error) {
    console.error("Error requesting recovery:", error);
    displayMessage(
      recoveryMessageDiv,
      "Fehler beim Senden der Bestätigung. Bitte versuche es später erneut.",
      "error"
    );
  } finally {
    setLoadingState(recoveryRequestButton, false);
  }
}
