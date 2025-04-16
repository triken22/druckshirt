// frontend/src/state.js

// --- Application State Management ---

// Central state object
const appState = {
  // User/Session related
  grantId: null, // Loaded from localStorage
  tokenBalance: 0,

  // Product Catalog
  availableProducts: [],

  // Current Design Selections
  selectedProduct: null,
  selectedColorName: null,
  selectedColorCode: null,
  selectedSize: null,
  selectedVariant: null,
  selectedImageUrl: null,
  quantity: 1,

  // Design Canvas State
  designState: {
    scale: 1.0,
    position: { x: 0, y: 0 },
    rotation: 0,
    originalSize: { width: 0, height: 0 },
  },

  // Checkout State
  shippingOptions: [],
  selectedShippingOption: null,
  tshirtClientSecret: null,

  // Mockup Interaction State (Might move to design.js later if purely transient)
  mockupInteraction: {
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
  },
};

// --- Local Storage Interaction ---

/**
 * Retrieves the token grant ID from local storage.
 * @returns {string | null} The grant ID or null if not found.
 */
export function getTokenGrantId() {
  if (appState.grantId === null) {
    // Try loading from localStorage only once
    appState.grantId = localStorage.getItem("token_grant_id") || false; // Use false to indicate checked
  }
  return appState.grantId || null; // Return null if it was false or empty string
}

/**
 * Saves the token grant ID to local storage and updates the state.
 * @param {string} grantId - The grant ID to save.
 * @returns {boolean} True if saved successfully, false otherwise.
 */
export function saveTokenGrantId(grantId) {
  if (!grantId) {
    console.warn("Attempted to save invalid grant_id");
    return false;
  }
  try {
    localStorage.setItem("token_grant_id", grantId);
    appState.grantId = grantId;
    return true;
  } catch (error) {
    console.error("Error saving grant ID to localStorage:", error);
    return false;
  }
}

// --- Getters --- (Add more as needed)

export function getAvailableProducts() {
  return [...appState.availableProducts]; // Return a shallow copy
}

export function getSelectedProduct() {
  return appState.selectedProduct ? { ...appState.selectedProduct } : null; // Return a shallow copy
}

export function getCurrentGrantId() {
  return appState.grantId;
}

// --- Setters --- (Add more as needed)

export function setAvailableProducts(products) {
  if (Array.isArray(products)) {
    appState.availableProducts = products;
  } else {
    console.error("setAvailableProducts received non-array:", products);
  }
}

export function setSelectedProduct(product) {
  // Add validation if needed
  appState.selectedProduct = product;
  // Potentially reset related state
  appState.selectedColorName = null;
  appState.selectedColorCode = null;
  appState.selectedSize = null;
  appState.selectedVariant = null;
  // TODO: Consider triggering state save here or elsewhere
}

// --- State Persistence (Session Storage) ---

/**
 * Saves the relevant parts of the application state to sessionStorage.
 * Should be called whenever a significant state change occurs (e.g., selection, design update).
 */
function saveStateToSession() {
  const stateToSave = {
    // Design transformations
    scale: appState.designState.scale,
    position: appState.designState.position,
    rotation: appState.designState.rotation,
    originalSize: appState.designState.originalSize,
    // Selections
    productId: appState.selectedProduct?.id || null,
    variantId: appState.selectedVariant?.id || null,
    size: appState.selectedSize || null,
    colorName: appState.selectedColorName || null, // Save selected color name too
    imageUrl: appState.selectedImageUrl || null,
    quantity: appState.quantity || 1,
  };

  try {
    sessionStorage.setItem(
      "druckmeinshirt_design_state",
      JSON.stringify(stateToSave)
    );
    // console.log("Saved design state to session:", stateToSave);
  } catch (error) {
    console.error("Error saving design state to sessionStorage:", error);
  }
}

/**
 * Restores the application state from sessionStorage.
 * Should be called once during application initialization, after products are loaded.
 * @returns {boolean} True if state was successfully restored, false otherwise.
 */
export function restoreStateFromSession() {
  const savedStateJSON = sessionStorage.getItem("druckmeinshirt_design_state");
  if (!savedStateJSON) {
    return false; // No state saved
  }

  try {
    const state = JSON.parse(savedStateJSON);
    console.log("Attempting to restore design state from session:", state);

    // Restore product first (requires availableProducts to be set already)
    if (state.productId && appState.availableProducts.length > 0) {
      const product = appState.availableProducts.find(
        (p) => p.id === state.productId
      );
      if (product) {
        appState.selectedProduct = product; // Directly set state
      } else {
        console.warn(
          `Restore Error: Saved product ID ${state.productId} not found.`
        );
        sessionStorage.removeItem("druckmeinshirt_design_state"); // Clear invalid state
        return false;
      }
    } else {
      return false; // Cannot restore without product context
    }

    // Restore selections (Color, Size, Image, Quantity)
    appState.selectedColorName = state.colorName || null;
    // Find color code based on restored name
    appState.selectedColorCode =
      appState.selectedProduct.available_colors.find(
        (c) => c.name === appState.selectedColorName
      )?.code || null;
    appState.selectedSize = state.size || null;
    appState.selectedImageUrl = state.imageUrl || null;
    appState.quantity = state.quantity || 1;

    // Restore design transformations
    appState.designState = {
      scale: state.scale || 1.0,
      position: state.position || { x: 0, y: 0 },
      rotation: state.rotation || 0,
      originalSize: state.originalSize || { width: 0, height: 0 },
    };

    // Attempt to find the matching variant based on restored color/size
    if (
      appState.selectedProduct &&
      appState.selectedColorName &&
      appState.selectedSize
    ) {
      const matchedVariant = appState.selectedProduct.variants?.find(
        (v) =>
          v.color === appState.selectedColorName &&
          v.size === appState.selectedSize &&
          v.in_stock
      );
      appState.selectedVariant = matchedVariant || null;
      if (!matchedVariant) {
        console.warn(
          `Restored variant not found/available for Color: ${appState.selectedColorName}, Size: ${appState.selectedSize}. Resetting size.`
        );
        // If variant doesn't match, reset the size selection as it's invalid for the color
        appState.selectedSize = null;
      }
    } else {
      appState.selectedVariant = null; // Reset if color/size missing
    }

    console.log("State successfully restored from session.");
    return true;
  } catch (error) {
    console.error("Error restoring design state from session:", error);
    sessionStorage.removeItem("druckmeinshirt_design_state"); // Clear corrupted state
    return false;
  }
}

// --- Add more Getters / Setters for other state parts ---

export function getDesignState() {
  return { ...appState.designState };
}

export function updateDesignState(partialState) {
  appState.designState = { ...appState.designState, ...partialState };
  saveStateToSession(); // Save state when design changes
}

export function setSelectedColor(colorName, colorCode) {
  appState.selectedColorName = colorName;
  appState.selectedColorCode = colorCode;
  appState.selectedSize = null; // Reset size when color changes
  appState.selectedVariant = null;
  saveStateToSession();
}

export function setSelectedSize(size) {
  appState.selectedSize = size;
  // Attempt to find the variant
  if (appState.selectedProduct && appState.selectedColorName) {
    const matchedVariant = appState.selectedProduct.variants?.find(
      (v) =>
        v.color === appState.selectedColorName &&
        v.size === appState.selectedSize &&
        v.in_stock
    );
    appState.selectedVariant = matchedVariant || null;
    if (!matchedVariant) {
      console.warn(
        `Selected variant not found/available for Color: ${appState.selectedColorName}, Size: ${appState.selectedSize}`
      );
    }
  } else {
    appState.selectedVariant = null;
  }
  saveStateToSession();
}

export function setSelectedImageUrl(url) {
  appState.selectedImageUrl = url;
  saveStateToSession();
}

export function setQuantity(qty) {
  appState.quantity = parseInt(qty, 10) || 1;
  saveStateToSession();
}

export function getTokenBalance() {
  return appState.tokenBalance;
}

export function setTokenBalance(balance) {
  appState.tokenBalance =
    typeof balance === "number" && balance >= 0 ? balance : 0;
  // No need to save session state for token balance usually
}

export function getShippingOptions() {
  return [...appState.shippingOptions];
}

export function setShippingOptions(options) {
  appState.shippingOptions = Array.isArray(options) ? options : [];
  // Reset selected option when new options are set
  appState.selectedShippingOption = null;
}

export function getSelectedShippingOption() {
  return appState.selectedShippingOption
    ? { ...appState.selectedShippingOption }
    : null;
}

export function setSelectedShippingOption(option) {
  appState.selectedShippingOption = option;
  // No need to save session state for this usually
}

export function getTshirtClientSecret() {
  return appState.tshirtClientSecret;
}

export function setTshirtClientSecret(secret) {
  appState.tshirtClientSecret = secret || null;
}

// Add getters for individual selection properties if needed
export function getSelectedColorName() {
  return appState.selectedColorName;
}

export function getSelectedSize() {
  return appState.selectedSize;
}

export function getSelectedVariant() {
  return appState.selectedVariant ? { ...appState.selectedVariant } : null;
}

export function getSelectedImageUrl() {
  return appState.selectedImageUrl;
}

export function getQuantity() {
  return appState.quantity;
}

// Getter for mockup interaction state (might move later)
export function getMockupInteractionState() {
  return { ...appState.mockupInteraction };
}

// Setter for mockup interaction state (might move later)
export function updateMockupInteractionState(partialState) {
  appState.mockupInteraction = {
    ...appState.mockupInteraction,
    ...partialState,
  };
  // Typically no need to save this transient state to session
}

// --- Initialization --- (Load grantId on module load)
getTokenGrantId();


