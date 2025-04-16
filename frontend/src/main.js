// --- Global Variables & State ---
let stripe = null;
let elements = null;
// Stripe Card Elements for token purchase and order
let tokenCardElement = null;
let orderCardElement = null;
let tokenGrantId = null;
let clientSecret = null;
let currentProductId = null;
let currentVariantId = null;
let currentMockupUrl = null;
let currentMockupImageUrl = null;
let selectedColor = null;
let selectedSize = null;
let currentShippingOption = null;

// DOM Element References (Declared globally, assigned in DOMContentLoaded)
let tokenBalanceDisplay,
  imageUploadInput,
  imageUploadButton,
  productListDiv,
  colorSwatchesDiv,
  mockupImageOverlay,
  tabButtons,
  tabContents,
  sizeSelectorDiv,
  quantityInput,
  proceedToCheckoutButton,
  checkoutSection,
  navButtons,
  posthogOptOutToggle,
  imageUploadResult,
  uploadStatus,
  imagePreviewUpload,
  emailInput,
  buyTokensButton,
  paymentElementContainer,
  submitPaymentButton,
  paymentMessage,
  grantIdDisplay,
  aiPromptInput,
  aiGenerateButton,
  aiStatus,
  aiResultsGrid,
  imagePreviewAi,
  orderSummaryDiv,
  shippingForm,
  shippingNameInput,
  shippingAddress1Input,
  shippingAddress2Input,
  shippingCityInput,
  shippingZipInput,
  shippingCountrySelect,
  shippingEmailInput,
  getShippingButton,
  shippingOptionsContainer,
  shippingOptionsListDiv,
  shippingStatusDiv,
  tshirtPaymentContainer,
  tshirtPaymentElementContainer,
  submitTshirtOrderButton,
  tshirtPaymentMessage,
  recoverySection,
  recoveryEmailInput,
  recoveryRequestButton,
  recoveryMessageDiv,
  designImageContainer,
  imageScaleSlider,
  rotateLeftButton,
  rotateRightButton,
  resetPositionButton,
  printableAreaGuide,
  togglePrintAreaButton;

// --- Initialization (Keep at the end) ---
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize analytics
  initAnalytics();
  trackPageView();
  trackPageView();
  // Recovery Flow: Grant ID recovery
  if (recoveryRequestButton && recoveryEmailInput && recoveryMessageDiv) {
    recoveryRequestButton.addEventListener('click', async () => {
      const email = recoveryEmailInput.value.trim();
      if (!email) {
        displayMessage(recoveryMessageDiv, 'Bitte eine gültige Email eingeben.', 'error');
        return;
      }
      // Analytics: grant ID recovery requested
      let emailHash;
      try {
        emailHash = await hashEmail(email);
      } catch {
        emailHash = null;
      }
      trackEvent('grant_id_recovery_requested', { email_hash: emailHash });
      setLoadingState(recoveryRequestButton, true);
      try {
        await recoverGrantId(email);
        displayMessage(
          recoveryMessageDiv,
          'Falls ein Kauf gefunden wurde, erhalten Sie eine Email mit Ihrer Grant ID.',
          'success'
        );
        // Analytics: grant ID recovery completed
        trackEvent('grant_id_recovered', { email_hash: emailHash });
      } catch (error) {
        console.error('Grant ID Recovery Error:', error);
        displayMessage(
          recoveryMessageDiv,
          'Fehler beim Anfordern der Wiederherstellung.',
          'error'
        );
      } finally {
        setLoadingState(recoveryRequestButton, false);
      }
    });
  }
  
  // --- Phase 1: Select ALL DOM Elements FIRST (with Granular Logging) ---
  console.log(
    "DOMContentLoaded: Selecting elements (Restored Selection Block)..."
  );
  try {
    // Select sizeSelectorDiv FIRST (as per previous test)
    console.log("Selecting: sizeSelectorDiv...");
    sizeSelectorDiv = document.getElementById("size-selector");
    console.log(`Selected sizeSelectorDiv: ${!!sizeSelectorDiv}`);

    // Select other elements
    tokenBalanceDisplay = document.getElementById("token-balance-display");
    console.log(`Selected tokenBalanceDisplay: ${!!tokenBalanceDisplay}`);
    imageUploadInput = document.getElementById("image-upload-input");
    console.log(`Selected imageUploadInput: ${!!imageUploadInput}`);
    imageUploadButton = document.getElementById("image-upload-button");
    console.log(`Selected imageUploadButton: ${!!imageUploadButton}`);
    productListDiv = document.getElementById("product-list");
    console.log(`Selected productListDiv: ${!!productListDiv}`);
    colorSwatchesDiv = document.getElementById("color-swatches");
    console.log(`Selected colorSwatchesDiv: ${!!colorSwatchesDiv}`);
    mockupImageOverlay = document.getElementById("design-image-container");
    console.log(`Selected mockupImageOverlay: ${!!mockupImageOverlay}`); // Corrected ID
    tabButtons = document.querySelectorAll(".tab-button");
    console.log(
      `Selected tabButtons: ${!!tabButtons} (Count: ${tabButtons?.length})`
    );
    tabContents = document.querySelectorAll(".tab-content");
    console.log(
      `Selected tabContents: ${!!tabContents} (Count: ${tabContents?.length})`
    );
    quantityInput = document.getElementById("quantity-input");
    console.log(`Selected quantityInput: ${!!quantityInput}`);
    proceedToCheckoutButton = document.getElementById(
      "proceed-to-checkout-button"
    );
    console.log(
      `Selected proceedToCheckoutButton: ${!!proceedToCheckoutButton}`
    );
    checkoutSection = document.getElementById("checkout-section");
    console.log(`Selected checkoutSection: ${!!checkoutSection}`);
    navButtons = document.querySelectorAll(".nav-button");
    console.log(
      `Selected navButtons: ${!!navButtons} (Count: ${navButtons?.length})`
    );
    posthogOptOutToggle = document.getElementById("posthog-opt-out-toggle");
    console.log(`Selected posthogOptOutToggle: ${!!posthogOptOutToggle}`);
    if (posthogOptOutToggle) {
      posthogOptOutToggle.addEventListener("change", () => {
        if (posthogOptOutToggle.checked) {
          optOutAnalytics();
          trackEvent('opt_out_analytics');
        } else {
          optInAnalytics();
          trackEvent('opt_in_analytics');
        }
      });
    }
    imageUploadResult = document.getElementById("image-upload-result");
    console.log(`Selected imageUploadResult: ${!!imageUploadResult}`);
    uploadStatus = document.getElementById("upload-status");
    console.log(`Selected uploadStatus: ${!!uploadStatus}`);
    imagePreviewUpload = document.getElementById("image-preview-upload");
    console.log(`Selected imagePreviewUpload: ${!!imagePreviewUpload}`);
    emailInput = document.getElementById("email-input");
    console.log(`Selected emailInput: ${!!emailInput}`);
    buyTokensButton = document.getElementById("buy-tokens-button");
    console.log(`Selected buyTokensButton: ${!!buyTokensButton}`);
    paymentElementContainer = document.getElementById(
      "payment-element-container"
    );
    console.log(
      `Selected paymentElementContainer: ${!!paymentElementContainer}`
    );
    submitPaymentButton = document.getElementById("submit-payment-button");
    console.log(`Selected submitPaymentButton: ${!!submitPaymentButton}`);
    paymentMessage = document.getElementById("payment-message");
    console.log(`Selected paymentMessage: ${!!paymentMessage}`);
    grantIdDisplay = document.getElementById("grant-id-display");
    console.log(`Selected grantIdDisplay: ${!!grantIdDisplay}`);
    aiPromptInput = document.getElementById("ai-prompt-input");
    console.log(`Selected aiPromptInput: ${!!aiPromptInput}`);
    aiGenerateButton = document.getElementById("ai-generate-button");
    console.log(`Selected aiGenerateButton: ${!!aiGenerateButton}`);
    aiStatus = document.getElementById("ai-status");
    console.log(`Selected aiStatus: ${!!aiStatus}`);
    aiResultsGrid = document.getElementById("ai-results-grid");
    console.log(`Selected aiResultsGrid: ${!!aiResultsGrid}`);
    imagePreviewAi = document.getElementById("image-preview-ai");
    console.log(`Selected imagePreviewAi: ${!!imagePreviewAi}`);
    orderSummaryDiv = document.getElementById("order-summary");
    console.log(`Selected orderSummaryDiv: ${!!orderSummaryDiv}`);
    shippingForm = document.getElementById("shipping-form");
    console.log(`Selected shippingForm: ${!!shippingForm}`);
    shippingNameInput = document.getElementById("shipping-name");
    console.log(`Selected shippingNameInput: ${!!shippingNameInput}`);
    shippingAddress1Input = document.getElementById("shipping-address1");
    console.log(`Selected shippingAddress1Input: ${!!shippingAddress1Input}`);
    shippingAddress2Input = document.getElementById("shipping-address2");
    console.log(`Selected shippingAddress2Input: ${!!shippingAddress2Input}`);
    shippingCityInput = document.getElementById("shipping-city");
    console.log(`Selected shippingCityInput: ${!!shippingCityInput}`);
    shippingZipInput = document.getElementById("shipping-zip");
    console.log(`Selected shippingZipInput: ${!!shippingZipInput}`);
    shippingCountrySelect = document.getElementById("shipping-country");
    console.log(`Selected shippingCountrySelect: ${!!shippingCountrySelect}`);
    shippingEmailInput = document.getElementById("shipping-email");
    console.log(`Selected shippingEmailInput: ${!!shippingEmailInput}`);
    getShippingButton = document.getElementById("get-shipping-button");
    console.log(`Selected getShippingButton: ${!!getShippingButton}`);
    shippingOptionsContainer = document.getElementById(
      "shipping-options-container"
    );
    console.log(
      `Selected shippingOptionsContainer: ${!!shippingOptionsContainer}`
    );
    shippingOptionsListDiv = document.getElementById("shipping-options-list");
    console.log(`Selected shippingOptionsListDiv: ${!!shippingOptionsListDiv}`);
    shippingStatusDiv = document.getElementById("shipping-status");
    console.log(`Selected shippingStatusDiv: ${!!shippingStatusDiv}`);
    tshirtPaymentContainer = document.getElementById(
      "tshirt-payment-container"
    );
    console.log(`Selected tshirtPaymentContainer: ${!!tshirtPaymentContainer}`);
    tshirtPaymentElementContainer = document.getElementById(
      "tshirt-payment-element-container"
    );
    console.log(
      `Selected tshirtPaymentElementContainer: ${!!tshirtPaymentElementContainer}`
    );
    submitTshirtOrderButton = document.getElementById(
      "submit-tshirt-order-button"
    );
    console.log(
      `Selected submitTshirtOrderButton: ${!!submitTshirtOrderButton}`
    );
    tshirtPaymentMessage = document.getElementById("tshirt-payment-message");
    console.log(`Selected tshirtPaymentMessage: ${!!tshirtPaymentMessage}`);
    recoverySection = document.getElementById("recovery-section");
    console.log(`Selected recoverySection: ${!!recoverySection}`);
    recoveryEmailInput = document.getElementById("recovery-email-input");
    console.log(`Selected recoveryEmailInput: ${!!recoveryEmailInput}`);
    recoveryRequestButton = document.getElementById("recovery-request-button");
    console.log(`Selected recoveryRequestButton: ${!!recoveryRequestButton}`);
    recoveryMessageDiv = document.getElementById("recovery-message");
    console.log(`Selected recoveryMessageDiv: ${!!recoveryMessageDiv}`);
    designImageContainer = document.getElementById("design-image-container");
    console.log(`Selected designImageContainer: ${!!designImageContainer}`); // Also select this explicitly
    imageScaleSlider = document.getElementById("image-scale-slider");
    console.log(`Selected imageScaleSlider: ${!!imageScaleSlider}`);
    // Design control buttons
    rotateLeftButton = document.getElementById("rotate-left");
    console.log(`Selected rotateLeftButton: ${!!rotateLeftButton}`);
    rotateRightButton = document.getElementById("rotate-right");
    console.log(`Selected rotateRightButton: ${!!rotateRightButton}`);
    resetPositionButton = document.getElementById("reset-position");
    console.log(`Selected resetPositionButton: ${!!resetPositionButton}`);
    printableAreaGuide = document.querySelector(".print-area-guide");
    console.log(`Selected printableAreaGuide: ${!!printableAreaGuide}`);
    togglePrintAreaButton = document.getElementById("toggle-printable-area");
    console.log(`Selected togglePrintAreaButton: ${!!togglePrintAreaButton}`);

    console.log(
      "DOMContentLoaded: Element selection complete (Restored Selection Block)."
    );
  } catch (error) {
    console.error(
      "CRITICAL Error during element selection (Restored Selection Block):",
      error
    );
  }
  // Helper to enable/disable Proceed to Checkout button based on design completeness
  function updateProceedToCheckout() {
    if (!proceedToCheckoutButton) return;
    const hasVariant = !!getSelectedVariant();
    const imgUrl = getSelectedImageUrl();
    const qty = getQuantity();
    proceedToCheckoutButton.disabled = !(hasVariant && imgUrl && qty > 0);
  }
  // Initialize Token Grant ID & Balance
  tokenGrantId = getTokenGrantId();
  // Disable AI generation if no grant ID
  if (!tokenGrantId && aiGenerateButton) {
    aiGenerateButton.disabled = true;
  }
  if (tokenGrantId && tokenBalanceDisplay) {
    try {
      const balanceRes = await apiGetTokenBalance(tokenGrantId);
      const bal = balanceRes?.tokens_remaining ?? 0;
      setTokenBalance(bal);
      updateTokenBalanceDisplay(bal, tokenBalanceDisplay);
      // Analytics: token balance checked
      trackEvent('token_balance_checked', { tokens_remaining: bal });
      // Enable/disable AI generate button based on balance
      if (aiGenerateButton) aiGenerateButton.disabled = bal < 1;
    } catch (error) {
      console.error("Token Balance Fetch Error:", error);
    }
  }
  // Restore design state if present
  if (restoreStateFromSession() && getSelectedProduct()) {
    const product = getSelectedProduct();
    clearColorSwatches(colorSwatchesDiv);
    displayColorSwatches(product.available_colors, colorSwatchesDiv);
    const colorName = getSelectedColorName();
    if (colorName) {
      const variants = product.variants.filter((v) => v.color === colorName && v.in_stock);
      clearSizes(sizeSelectorDiv);
      displaySizes(variants, sizeSelectorDiv);
    }
    quantityInput.value = getQuantity();
    const imageUrl = getSelectedImageUrl();
    if (imageUrl) {
      loadDesignImage(designImageContainer, imageUrl);
      // Enable proceed button
      updateProceedToCheckout();
    }
  }

  // Initial product loading flow
  if (productListDiv) {
    showProductListLoading(productListDiv);
    try {
      const result = await fetchProducts();
      const products = result?.products || [];
      setAvailableProducts(products);
      displayProducts(products, productListDiv);
    } catch (error) {
      displayMessage(
        productListDiv,
        "Fehler beim Laden der Produkte.",
        "error"
      );
    }

    // --- Phase 4: UI Event Listeners ---
    // Navigation between main sections
    navButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        navButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.dataset.target;
        showSection(target);
        // Analytics: navigation
        trackEvent('navigation', { target });
        if (target === 'checkout-section') {
          trackEvent('checkout_started');
        }
      });
    });

    // Tab switching between Upload and AI in design step
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabButtons.forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
        tabContents.forEach((c) =>
          c.classList.toggle(
            "active",
            c.id === btn.dataset.target
          )
        );
      });
    });

    // Product selection
    productListDiv.addEventListener("click", (e) => {
      const item = e.target.closest(".product-item");
      if (!item) return;
      const productId = item.dataset.productId;
      const product = getAvailableProducts().find(
        (p) => p.id == productId
      );
      if (product) {
        setSelectedProduct(product);
        clearColorSwatches(colorSwatchesDiv);
        clearSizes(sizeSelectorDiv);
        displayColorSwatches(
          product.available_colors,
          colorSwatchesDiv
        );
      }
    });

    // Color selection
    colorSwatchesDiv.addEventListener("click", (e) => {
      const swatch = e.target.closest(".color-swatch");
      if (!swatch) return;
      const colorName = swatch.dataset.colorName;
      const colorCode = swatch.dataset.colorCode;
      setSelectedColor(colorName, colorCode);
      // Analytics: T-shirt color selected
      const selectedProd = getSelectedProduct();
      trackEvent('tshirt_color_selected', { product_id: selectedProd?.id, color: colorName });
      const variants = getSelectedProduct()?.variants || [];
      const availableVariants = variants.filter(
        (v) => v.color === colorName && v.in_stock
      );
      clearSizes(sizeSelectorDiv);
      displaySizes(availableVariants, sizeSelectorDiv);
    });

    // Size selection
    sizeSelectorDiv.addEventListener("click", (e) => {
      const btn = e.target.closest(".size-option");
      if (!btn) return;
      const size = btn.dataset.size;
      setSelectedSize(size);
      // Analytics: T-shirt size selected
      const selectedProd = getSelectedProduct();
      trackEvent('tshirt_size_selected', { product_id: selectedProd?.id, size });
      // Update proceed button
      updateProceedToCheckout();
    });

    // Design finalized: proceed to checkout
    if (proceedToCheckoutButton) {
      proceedToCheckoutButton.addEventListener("click", () => {
        const prod = getSelectedProduct();
        trackEvent('design_finalized', {
          product_id: prod?.id,
          color: getSelectedColorName(),
          size: getSelectedSize(),
          quantity: getQuantity(),
        });
        // Analytics: checkout started after design
        trackEvent('checkout_started');
        showSection('checkout-section');
      });
    }

    // Quantity change
    quantityInput.addEventListener("change", (e) => {
      setQuantity(e.target.value);
      // Update proceed button
      updateProceedToCheckout();
      // Analytics: quantity changed
      trackEvent('design_quantity_changed', { quantity: getQuantity() });
    });
    // Image Upload Flow
    if (imageUploadButton && imageUploadInput) {
      imageUploadButton.addEventListener("click", async () => {
        const file = imageUploadInput.files?.[0];
        if (!file) {
          displayMessage(uploadStatus, "Bitte ein Bild auswählen.", "error");
          return;
        }
        // Client-side file type validation
        const validTypes = ['image/png', 'image/jpeg'];
        if (!validTypes.includes(file.type)) {
          displayMessage(uploadStatus, "Nur PNG und JPEG Dateitypen erlaubt.", "error");
          return;
        }
        setLoadingState(imageUploadButton, true);
        const formData = new FormData();
        formData.append("image", file);
        try {
          const res = await uploadImage(formData);
          const imageUrl = res?.imageUrl;
          if (imageUrl) {
            // Analytics: Image uploaded
            trackEvent('image_uploaded', { file_type: file.type, file_size: file.size });
            setSelectedImageUrl(imageUrl);
            loadDesignImage(designImageContainer, imageUrl);
            // Enable proceed button
            updateProceedToCheckout();
          } else {
            throw new Error("No imageUrl in response");
          }
        } catch (error) {
          console.error("Upload Error:", error);
          displayMessage(uploadStatus, "Upload fehlgeschlagen.", "error");
        } finally {
          setLoadingState(imageUploadButton, false);
        }
      });
    }

    // AI Image Generation Flow
    if (aiGenerateButton && aiPromptInput) {
      aiGenerateButton.addEventListener("click", async () => {
        const prompt = aiPromptInput.value.trim();
        if (!prompt) {
          displayMessage(aiStatus, "Bitte Prompt eingeben.", "error");
          return;
        }
        const grantId = getTokenGrantId();
        if (!grantId) {
          displayMessage(aiStatus, "Keine Grant ID gefunden.", "error");
          return;
        }
        // Analytics: AI prompt submitted
        trackEvent('ai_prompt_submitted', { prompt });
        setLoadingState(aiGenerateButton, true);
        clearAiResults(aiResultsGrid);
        displayMessage(aiStatus, "", "info");
        try {
          const result = await generateImage(prompt, grantId);
          const images = result?.images || [];
          const revised = result?.revised_prompt;
          // Analytics: AI images generated
          trackEvent('ai_image_generated', {
            prompt,
            revised_prompt: revised,
            num_images_returned: images.length,
          });
          displayAiResults(images, aiResultsGrid);
          // Update token balance after generation
          const balRes = await apiGetTokenBalance(grantId);
          const bal = balRes?.tokens_remaining ?? 0;
          setTokenBalance(bal);
          updateTokenBalanceDisplay(bal, tokenBalanceDisplay);
        } catch (error) {
          console.error("AI Generation Error:", error);
          displayMessage(aiStatus, "AI Generierung fehlgeschlagen.", "error");
        } finally {
          setLoadingState(aiGenerateButton, false);
        }
      });
    }

    // AI Result Selection
    if (aiResultsGrid) {
      aiResultsGrid.addEventListener("click", (e) => {
        const item = e.target.closest(".ai-result-item");
        if (!item) return;
        const url = item.dataset.imageUrl;
        // Analytics: AI image selected
        trackEvent('ai_image_selected', { image_url: url });
        setSelectedImageUrl(url);
        loadDesignImage(designImageContainer, url);
        clearAiResults(aiResultsGrid);
        // Enable proceed button
        updateProceedToCheckout();
      });
    }

    // Initialize design canvas controls
    initializeDesignControls({
      designContainer: designImageContainer,
      scaleSlider: imageScaleSlider,
      rotateLeftButton,
      rotateRightButton,
      resetPositionButton,
      printAreaGuide: printableAreaGuide,
      togglePrintAreaButton,
    });
  }

  // --- Token Purchase Flow ---
  if (buyTokensButton && emailInput && paymentElementContainer && submitPaymentButton) {
    buyTokensButton.addEventListener("click", async () => {
      const email = emailInput.value.trim();
      if (!email) {
        displayMessage(paymentMessage, "Bitte eine gültige Email eingeben.", "error");
        return;
      }
      // Analytics: Token purchase initiated
      trackEvent('token_purchase_initiated', { bundle_id: CONFIG.TOKENS.BUNDLE_ID });
      setLoadingState(buyTokensButton, true);
      try {
        const res = await purchaseTokens(CONFIG.TOKENS.BUNDLE_ID, email);
        clientSecret = res.client_secret;
        tokenGrantId = res.grant_id;
        saveTokenGrantId(tokenGrantId);
        // Initialize Stripe Elements for payment
        stripe = Stripe(CONFIG.STRIPE_PUBLISHABLE_KEY);
        elements = stripe.elements();
        tokenCardElement = elements.create("card");
        paymentElementContainer.style.display = "block";
        tokenCardElement.mount("#payment-element-container");
        submitPaymentButton.style.display = "block";
        buyTokensButton.style.display = "none";
        emailInput.disabled = true;
        displayMessage(paymentMessage, "Bitte Zahlungsdaten eingeben.", "info");
      } catch (error) {
        console.error("Token Purchase Init Error:", error);
        displayMessage(paymentMessage, "Token-Kauf fehlgeschlagen.", "error");
        setLoadingState(buyTokensButton, false);
      }
    });
    // Confirm Token Purchase Payment
    submitPaymentButton.addEventListener("click", async () => {
      // Analytics: Payment initiated for tokens
      trackEvent('payment_initiated', { purchase_type: 'tokens' });
      setLoadingState(submitPaymentButton, true);
      try {
        const { paymentIntent, error } = await stripe.confirmCardPayment(
          clientSecret,
          { payment_method: { card: tokenCardElement } }
        );
        if (error) {
          throw error;
        }
        // Payment succeeded
        displayMessage(paymentMessage, "Zahlung erfolgreich!", "success");
        // Analytics: token purchase completed
        trackEvent('token_purchase_completed', {
          bundle_id: CONFIG.TOKENS.BUNDLE_ID,
          grant_id: tokenGrantId,
          amount_eur: CONFIG.TOKENS.PRICE_EUR,
        });
        grantIdDisplay.textContent = `Grant ID: ${tokenGrantId}`;
        grantIdDisplay.style.display = "block";
        // Update token balance
        const balRes = await apiGetTokenBalance(tokenGrantId);
        const bal = balRes?.tokens_remaining ?? 0;
        setTokenBalance(bal);
        updateTokenBalanceDisplay(bal, tokenBalanceDisplay);
        // Cleanup
        paymentElementContainer.style.display = "none";
        submitPaymentButton.style.display = "none";
      } catch (error) {
        console.error("Token Purchase Payment Error:", error);
        displayMessage(paymentMessage, error.message || "Zahlung fehlgeschlagen.", "error");
      } finally {
        setLoadingState(submitPaymentButton, false);
        setLoadingState(buyTokensButton, false);
      }
    });
  }

  // --- Shipping Options Flow ---
  if (
    getShippingButton &&
    shippingOptionsContainer &&
    shippingOptionsListDiv &&
    shippingForm &&
    shippingNameInput &&
    shippingEmailInput &&
    shippingAddress1Input &&
    shippingCityInput &&
    shippingZipInput &&
    shippingCountrySelect
  ) {
    getShippingButton.addEventListener("click", async () => {
      // Validate required shipping fields
      const name = shippingNameInput.value.trim();
      const email = shippingEmailInput.value.trim();
      const address1 = shippingAddress1Input.value.trim();
      const city = shippingCityInput.value.trim();
      const zip = shippingZipInput.value.trim();
      const country = shippingCountrySelect.value;
      if (!name || !email || !address1 || !city || !zip || !country) {
        displayMessage(shippingStatusDiv, "Bitte alle erforderlichen Felder ausfüllen.", "error");
        return;
      }
      setLoadingState(getShippingButton, true);
      try {
        const recipient = {
          address: {
            name,
            email,
            address1,
            address2: shippingAddress2Input.value.trim(),
            city,
            zip,
            country_code: country,
          },
        };
        const variant = getSelectedVariant();
        const items = variant
          ? [{ quantity: getQuantity(), catalog_variant_id: variant.id }]
          : [];
        const res = await apiGetShippingOptions(recipient, items);
        const options = res?.shipping_options || [];
        setShippingOptions(options);
        displayShippingOptions(options, shippingOptionsListDiv);
        shippingOptionsContainer.style.display = "block";
      } catch (error) {
        console.error("Shipping Options Error:", error);
        displayMessage(shippingStatusDiv, "Versandoptionen konnten nicht geladen werden.", "error");
      } finally {
        setLoadingState(getShippingButton, false);
      }
    });

    // Handle shipping option selection
    shippingOptionsListDiv.addEventListener("click", (e) => {
      const optEl = e.target.closest(".shipping-option");
      if (!optEl) return;
      const idx = parseInt(optEl.dataset.optionIndex, 10);
      const options = getStateShippingOptions();
      const selected = options[idx];
      if (!selected) return;
      shippingOptionsListDiv
        .querySelectorAll(".shipping-option")
        .forEach((el) => el.classList.remove("selected"));
      optEl.classList.add("selected");
      setSelectedShippingOption(selected);
      // Analytics: Shipping option selected
      trackEvent('shipping_option_selected', { service_name: selected.name || selected.service_name, rate: selected.rate });
      tshirtPaymentContainer.style.display = "block";
      // Render order summary
      const summary = {
        product: getSelectedProduct(),
        color: getSelectedColorName(),
        size: getSelectedSize(),
        quantity: getQuantity(),
        shipping: selected,
      };
      displayOrderSummary(summary, orderSummaryDiv);
      // Initialize Stripe Elements for T-shirt order if not already
      if (!orderCardElement) {
        stripe = Stripe(CONFIG.STRIPE_PUBLISHABLE_KEY);
        elements = stripe.elements();
        orderCardElement = elements.create("card");
        orderCardElement.mount("#tshirt-payment-element-container");
      }
    });

    // Confirm T-Shirt Order Payment
    if (submitTshirtOrderButton) {
      submitTshirtOrderButton.addEventListener("click", async () => {
        setLoadingState(submitTshirtOrderButton, true);
        try {
          // Analytics: Payment initiated for T-shirt order
          trackEvent('payment_initiated', { purchase_type: 'tshirt' });
          const orderDetails = {
            recipient: {
              address: {
                name: shippingNameInput.value.trim(),
                email: shippingEmailInput.value.trim(),
                address1: shippingAddress1Input.value.trim(),
                address2: shippingAddress2Input.value.trim(),
                city: shippingCityInput.value.trim(),
                zip: shippingZipInput.value.trim(),
                country_code: shippingCountrySelect.value,
              },
            },
            items: [
              {
                quantity: getQuantity(),
                catalog_variant_id: getSelectedVariant().id,
              },
            ],
          };
          const { client_secret: orderClientSecret } = await createTshirtOrder(orderDetails);
          const { paymentIntent, error } = await stripe.confirmCardPayment(
            orderClientSecret,
            { payment_method: { card: orderCardElement } }
          );
          if (error) throw error;
          displayMessage(tshirtPaymentMessage, "Bestellung erfolgreich! Sie erhalten eine Bestätigung per Email.", "success");
          // Analytics: T-shirt order completed
          trackEvent('tshirt_order_completed', {
            payment_intent_id: paymentIntent.id,
            shipping_country: shippingCountrySelect.value,
          });
        } catch (error) {
          console.error("T-Shirt Order Error:", error);
          displayMessage(tshirtPaymentMessage, error.message || "Bestellung fehlgeschlagen.", "error");
        } finally {
          setLoadingState(submitTshirtOrderButton, false);
        }
      });
    }
  }
  
  /* --- Temporarily Commented Out --- 
  // --- Phase 2: Initialize Stripe & PostHog --- 
  // ... existing commented out code ...
  // --- Phase 3: Add ALL Event Listeners AFTER element selection & lib init ---
  // ... existing commented out code ...
  // --- Phase 4: Initial Setup Calls ---
  // ... existing commented out code ...
  */
});

// Add back function definitions (empty stubs or full code) later
// For now, keep functions commented/removed

import {
  fetchProducts,
  uploadImage,
  generateImage,
  getTokenBalance as apiGetTokenBalance,
  purchaseTokens,
  createTshirtOrder,
  getShippingOptions as apiGetShippingOptions,
  recoverGrantId,
} from "./api.js";
import {
  displayProducts,
  updateTokenBalanceDisplay,
  showSection,
  displayMessage,
  showProductListLoading,
  clearProductList,
  displayColorSwatches,
  clearColorSwatches,
  displaySizes,
  clearSizes,
  displayAiResults,
  clearAiResults,
  displayShippingOptions,
  clearShippingOptions,
  displayOrderSummary,
} from "./ui.js";
import { setLoadingState, hashEmail } from "./utils.js";
import { CONFIG } from "./config.js";
import {
  initAnalytics,
  trackEvent,
  trackPageView,
  optOutAnalytics,
  optInAnalytics,
} from "./analytics.js";
import {
  setAvailableProducts,
  getAvailableProducts,
  setSelectedProduct,
  getSelectedProduct,
  setSelectedColor,
  getSelectedColorName,
  setSelectedSize,
  getSelectedSize,
  setQuantity,
  getQuantity,
  getTokenGrantId,
  saveTokenGrantId,
  setTokenBalance,
  restoreStateFromSession,
  getSelectedImageUrl,
  setSelectedImageUrl,
  getSelectedVariant,
  setShippingOptions,
  getShippingOptions as getStateShippingOptions,
  setSelectedShippingOption,
} from "./state.js";
import { initializeDesignControls, loadDesignImage } from "./design.js";

// All backend communication should now use the imported API functions from api.js
// All UI updates should now use the imported UI functions from ui.js
