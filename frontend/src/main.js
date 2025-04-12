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

// --- Stripe Variables ---
let stripe = null;
let paymentElement = null;
let currentClientSecret = null;
let currentGrantId = null;

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
  // Select DOM Elements
  tokenBalanceDisplay = document.getElementById("token-balance-display");
  imageUploadInput = document.getElementById("image-upload-input");
  imageUploadButton = document.getElementById("image-upload-button");
  imageUploadResult = document.getElementById("image-upload-result");
  uploadStatus = document.getElementById("upload-status");
  emailInput = document.getElementById("email-input");
  buyTokensButton = document.getElementById("buy-tokens-button");
  paymentElementContainer = document.getElementById(
    "payment-element-container"
  );
  submitPaymentButton = document.getElementById("submit-payment-button");
  paymentMessage = document.getElementById("payment-message");
  grantIdDisplay = document.getElementById("grant-id-display");

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
    imageUploadButton.addEventListener("click", handleImageUpload);
  }
  if (buyTokensButton) {
    buyTokensButton.addEventListener("click", initiateTokenPurchase);
  }
  if (submitPaymentButton) {
    submitPaymentButton.addEventListener("click", handleTokenPaymentSubmit);
  }

  // Initial Token Balance Check
  fetchAndDisplayTokenBalance();
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

async function handleImageUpload() {
  if (
    !imageUploadInput ||
    !imageUploadInput.files ||
    imageUploadInput.files.length === 0
  ) {
    displayMessage(uploadStatus, "Bitte wähle zuerst ein Bild aus.", "error");
    return;
  }

  const file = imageUploadInput.files[0];
  const formData = new FormData();
  formData.append("image", file);

  displayMessage(uploadStatus, "Lade Bild hoch...", "info");
  setLoadingState(imageUploadButton, true);
  imageUploadResult.innerHTML = ""; // Clear previous result

  try {
    const response = await fetch(`${API_BASE_URL}/upload-image`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    displayMessage(uploadStatus, "Upload erfolgreich!", "success");
    imageUploadResult.innerHTML = `Bild URL: <a href="${data.imageUrl}" target="_blank">${data.imageUrl}</a><br><img src="${data.imageUrl}" alt="Hochgeladenes Bild">`;
    // TODO: Use this imageUrl for the design phase
  } catch (error) {
    console.error("Error uploading image:", error);
    displayMessage(
      uploadStatus,
      `Upload fehlgeschlagen: ${error.message}`,
      "error"
    );
  } finally {
    setLoadingState(imageUploadButton, false);
  }
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

// TODO: Implement PostHog integration if needed for Phase 1, or defer
// import posthog from 'posthog-js';
