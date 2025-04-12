console.log("DruckMeinShirt frontend loaded!");

// PostHog Initialization (placeholder)
// import posthog from 'posthog-js'
// posthog.init('<ph_project_api_key>', { api_host: '<ph_instance_address>' })

// TODO: Implement frontend logic
// - Image Upload Handling
// - AI Prompt Input & Display
// - Mockup Canvas Interaction
// - Token Purchase Flow
// - T-Shirt Ordering Flow
// - API calls to backend worker

// Configuration (Replace with your actual keys or use environment variables)
// TODO: Replace with your actual Stripe Publishable Key
const STRIPE_PUBLISHABLE_KEY = "pk_test_YOUR_KEY_HERE";
// TODO: Set up PostHog integration properly in later phase
// const POSTHOG_API_KEY = 'phc_YOUR_KEY_HERE';
// const POSTHOG_HOST_URL = 'https://app.posthog.com';

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
let availableProducts = [];
let selectedProduct = null;
let selectedVariant = null;
let selectedImageUrl = null; // URL of the image chosen for design

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
  // if (POSTHOG_API_KEY !== 'phc_YOUR_KEY_HERE') {
  //     posthog.init(POSTHOG_API_KEY, { api_host: POSTHOG_HOST_URL });
  // }

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

  // Initial Token Balance Check
  fetchAndDisplayTokenBalance();
  fetchAndDisplayProducts();
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
      updateMockupImage(data.imageUrl); // Use the uploaded image URL
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
      // posthog.capture('token_purchase_completed', { bundle_id: TOKEN_BUNDLE_ID, grant_id: currentGrantId });
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
  selectedImageUrl = imageUrl; // Store the selected URL
  if (mockupImageOverlay) {
    mockupImageOverlay.src = imageUrl;
    mockupImageOverlay.style.display = imageUrl ? "block" : "none";
  } else {
    console.error("Mockup image overlay element not found");
  }
  // TODO: Enable checkout button if design is complete
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
  }
}

async function fetchAndDisplayProducts() {
  if (!productListDiv) return;
  productListDiv.innerHTML = "<p>Lade T-Shirt Produkte...</p>";
  try {
    const response = await fetch(`${API_BASE_URL}/printful/products`); // Add query params if needed
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    availableProducts = data.products || []; // Store fetched products

    if (availableProducts.length === 0) {
      productListDiv.innerHTML = "<p>Keine Produkte gefunden.</p>";
      return;
    }

    // Render product list
    productListDiv.innerHTML = ""; // Clear loading message
    availableProducts.forEach((product) => {
      const item = document.createElement("div");
      item.classList.add("product-item");
      item.textContent = product.name; // Display product name
      item.dataset.productId = product.id; // Store ID for selection
      productListDiv.appendChild(item);
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
    // Visually indicate selection
    productListDiv
      .querySelectorAll(".product-item")
      .forEach((item) => item.classList.remove("selected"));
    targetItem.classList.add("selected");

    // Update color swatches based on selected product
    displayColorSwatches(selectedProduct);
    selectedVariant = null; // Reset variant selection
    // TODO: Update Mockup base image if available in product data
    displayMessage(
      document.getElementById("design-status"),
      `${selectedProduct.name} ausgewählt.`,
      "info"
    );
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

  // Visually indicate selection
  colorSwatchesDiv
    .querySelectorAll(".color-swatch")
    .forEach((swatch) => swatch.classList.remove("selected"));
  targetSwatch.classList.add("selected");

  // Find a variant matching the color (and potentially default size if needed later)
  // For now, just store the selected color. Size selection comes later.
  selectedVariant = { color: colorName, color_code: colorCode }; // Simplified for now

  // Update Mockup Background Color (or image if available)
  // This is a simplification; ideally, we'd load a specific variant mockup image
  const mockupBg = document.getElementById("mockup-background");
  if (mockupBg) {
    mockupBg.style.backgroundColor = colorCode;
    mockupBg.style.backgroundImage = "none"; // Remove placeholder if color is set
    // TODO: Try to find and load a variant-specific mockup image if available from product data
  }
  displayMessage(
    document.getElementById("design-status"),
    `Farbe ${colorName} ausgewählt.`,
    "info"
  );

  // TODO: Enable size selection / checkout button if design is complete
}

// TODO: Implement PostHog integration if needed for Phase 1, or defer
// import posthog from 'posthog-js';
