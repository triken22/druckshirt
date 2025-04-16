import { displayMessage as displayMessageUtil } from "./utils.js";

// Display the list of products in the UI
export function displayProducts(products, productListDiv) {
  if (!productListDiv) return;
  if (!Array.isArray(products) || products.length === 0) {
    productListDiv.innerHTML =
      '<div class="no-products">Keine Produkte gefunden.</div>';
    return;
  }
  // Ensure container uses product-list grid
  productListDiv.classList.add('product-list');
  productListDiv.innerHTML = products
    .map(
      (product) => `
        <div class="product-item" data-product-id="${product.id}">
          <div class="product-image-wrapper">
            ${product.image_url
              ? `<img src="${product.image_url}" alt="${product.name}" class="product-image" />`
              : ''}
            <div class="product-name-overlay"><span>${product.name}</span></div>
          </div>
        </div>
      `
    )
    .join('');
}

// Update the token balance display
export function updateTokenBalanceDisplay(balance, tokenBalanceDisplay) {
  if (tokenBalanceDisplay) {
    tokenBalanceDisplay.textContent = `Tokens: ${balance}`;
  }
}

// Show a specific section in the UI
/**
 * Show only the specified section and hide others.
 * @param {string} sectionId - The id of the section to display.
 */
export function showSection(sectionId) {
  const sections = document.querySelectorAll('.section');
  sections.forEach((sec) => {
    sec.style.display = sec.id === sectionId ? 'block' : 'none';
  });
}

// Render a loading state for the product list
export function showProductListLoading(productListDiv) {
  if (productListDiv) {
    productListDiv.innerHTML =
      '<div class="loading">Produkte werden geladen...</div>';
  }
}

// Clear the product list
export function clearProductList(productListDiv) {
  if (productListDiv) {
    productListDiv.innerHTML = "";
  }
}

/**
 * Render color swatches for available product colors.
 * @param {Array<{name: string, code: string}>} colors
 * @param {HTMLElement|null} container
 */
export function displayColorSwatches(colors, container) {
  if (!container) return;
  container.innerHTML = colors
    .map(
      (c) => `<div class="color-swatch" data-color-name="${c.name}" data-color-code="${c.code}" title="${c.name}" style="background-color: ${c.code};"></div>`
    )
    .join('');
}

/**
 * Clear any rendered color swatches.
 * @param {HTMLElement|null} container
 */
export function clearColorSwatches(container) {
  if (!container) return;
  container.innerHTML = '';
}

/**
 * Render size options based on available variants.
 * @param {Array<{size: string}>} variants
 * @param {HTMLElement|null} container
 */
export function displaySizes(variants, container) {
  if (!container) return;
  container.innerHTML = variants
    .map(
      (v) => `<button class="size-option button" data-size="${v.size}">${v.size}</button>`
    )
    .join('');
}

/**
 * Clear any rendered size options.
 * @param {HTMLElement|null} container
 */
export function clearSizes(container) {
  if (!container) return;
  container.innerHTML = '';
}
/**
 * Render AI-generated image results as selectable items.
 * @param {string[]} images - Array of image URLs.
 * @param {HTMLElement|null} container - The container to render into.
 */
export function displayAiResults(images, container) {
  if (!container) return;
  if (!Array.isArray(images) || images.length === 0) {
    container.innerHTML = '<div class="no-results">Keine Ergebnisse.</div>';
    return;
  }
  container.innerHTML = images
    .map(
      (url) => `
        <div class="ai-result-item" data-image-url="${url}">
          <img src="${url}" alt="AI Ergebnis" class="ai-result-image" />
        </div>
      `
    )
    .join('');
}

/**
 * Clear displayed AI image results.
 * @param {HTMLElement|null} container
 */
export function clearAiResults(container) {
  if (!container) return;
  container.innerHTML = '';
}

/**
 * Render shipping options as selectable items.
 * @param {Array<Object>} options - Array of shipping option objects.
 * @param {HTMLElement|null} container - The container to render into.
 */
export function displayShippingOptions(options, container) {
  if (!container) return;
  if (!Array.isArray(options) || options.length === 0) {
    container.innerHTML = '<div class="no-options">Keine Versandoptionen gefunden.</div>';
    return;
  }
  container.innerHTML = options
    .map((opt, idx) => {
      const name = opt.name || opt.service_name || 'Option';
      const rate = typeof opt.rate === 'number' ? (opt.rate / 100).toFixed(2) : opt.rate;
      const currency = opt.currency || '';
      const eta = opt.estimated_days ? ` (${opt.estimated_days} Tage)` : '';
      return `
        <div class="shipping-option" data-option-index="${idx}">
          <div class="shipping-option-name">${name}</div>
          <div class="shipping-option-price">${rate} ${currency}${eta}</div>
        </div>
      `;
    })
    .join('');
}

/**
 * Clear any rendered shipping options.
 * @param {HTMLElement|null} container
 */
export function clearShippingOptions(container) {
  if (!container) return;
  container.innerHTML = '';
}

/**
 * Render the order summary before checkout.
 * @param {Object} summary - Order details summary.
 * @param {HTMLElement|null} container - The container to render into.
 */
export function displayOrderSummary(summary, container) {
  if (!container || !summary) return;
  const { product, color, size, quantity, shipping } = summary;
  const rate = typeof shipping.rate === 'number' ? (shipping.rate / 100).toFixed(2) : shipping.rate;
  const currency = shipping.currency || '';
  container.innerHTML = `
    <p><strong>Produkt:</strong> ${product.name}</p>
    <p><strong>Farbe:</strong> ${color}</p>
    <p><strong>Größe:</strong> ${size}</p>
    <p><strong>Menge:</strong> ${quantity}</p>
    <p><strong>Versand:</strong> ${shipping.name} - ${rate} ${currency}</p>
  `;
}

// Re-export displayMessage for UI use
export const displayMessage = displayMessageUtil;


