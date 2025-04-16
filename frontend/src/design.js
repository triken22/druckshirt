import { getDesignState, updateDesignState } from "./state.js";
import { trackEvent } from "./analytics.js";

/**
 * Apply CSS transform based on stored design state.
 * @param {HTMLElement} container
 */
function applyTransform(container) {
  if (!container) return;
  const { position, scale, rotation } = getDesignState();
  container.style.transform =
    `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`;
}

/**
 * Initialize design canvas controls: drag, scale, rotate, reset, and print area toggle.
 * @param {Object} elements
 * @param {HTMLElement} elements.designContainer - Container for the design image.
 * @param {HTMLInputElement} [elements.scaleSlider] - Range input for scaling.
 * @param {HTMLElement} [elements.rotateLeftButton] - Button to rotate left.
 * @param {HTMLElement} [elements.rotateRightButton] - Button to rotate right.
 * @param {HTMLElement} [elements.resetPositionButton] - Button to reset position/scale/rotation.
 * @param {HTMLElement} [elements.printAreaGuide] - Element showing the printable area.
 * @param {HTMLElement} [elements.togglePrintAreaButton] - Button to toggle the printable area guide.
 */
export function initializeDesignControls({
  designContainer,
  scaleSlider,
  rotateLeftButton,
  rotateRightButton,
  resetPositionButton,
  printAreaGuide,
  togglePrintAreaButton,
}) {
  if (!designContainer) return;

  // Ensure transform origin is top-left
  designContainer.style.transformOrigin = "top left";

  // Dragging behavior
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initX = 0;
  let initY = 0;
  designContainer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const { position } = getDesignState();
    initX = position.x;
    initY = position.y;
    designContainer.setPointerCapture(e.pointerId);
    designContainer.style.cursor = "grabbing";
  });
  designContainer.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const newX = initX + dx;
    const newY = initY + dy;
    updateDesignState({ position: { x: newX, y: newY } });
    applyTransform(designContainer);
  });
  designContainer.addEventListener("pointerup", (e) => {
    if (isDragging) {
      const { position } = getDesignState();
      trackEvent('image_manipulated', { action: 'drag', position });
    }
    isDragging = false;
    designContainer.releasePointerCapture(e.pointerId);
    designContainer.style.cursor = "grab";
  });

  // Scaling behavior
  if (scaleSlider) {
    scaleSlider.addEventListener("input", (e) => {
      const scale = parseFloat(e.target.value);
      updateDesignState({ scale });
      applyTransform(designContainer);
      trackEvent('image_manipulated', { action: 'scale', scale });
    });
  }

  // Rotation behavior
  if (rotateLeftButton) {
    rotateLeftButton.addEventListener("click", () => {
      const { rotation } = getDesignState();
      const newRot = rotation - 15;
      updateDesignState({ rotation: newRot });
      applyTransform(designContainer);
      trackEvent('image_manipulated', { action: 'rotate', rotation: newRot });
    });
  }
  if (rotateRightButton) {
    rotateRightButton.addEventListener("click", () => {
      const { rotation } = getDesignState();
      const newRot = rotation + 15;
      updateDesignState({ rotation: newRot });
      applyTransform(designContainer);
      trackEvent('image_manipulated', { action: 'rotate', rotation: newRot });
    });
  }

  // Reset position, scale, and rotation
  if (resetPositionButton) {
    resetPositionButton.addEventListener("click", () => {
      updateDesignState({ position: { x: 0, y: 0 }, scale: 1, rotation: 0 });
      if (scaleSlider) scaleSlider.value = "1";
      applyTransform(designContainer);
    });
  }

  // Toggle printable area guide
  if (togglePrintAreaButton && printAreaGuide) {
    togglePrintAreaButton.addEventListener("click", () => {
      const visible = printAreaGuide.style.display === "block";
      printAreaGuide.style.display = visible ? "none" : "block";
    });
  }

  // Initial application of transform
  applyTransform(designContainer);
}

/**
 * Load and display a design image within the container.
 * @param {HTMLElement} designContainer
 * @param {string} imageUrl
 */
export function loadDesignImage(designContainer, imageUrl) {
  if (!designContainer || !imageUrl) return;
  let img = designContainer.querySelector("img#design-image");
  if (!img) {
    img = document.createElement("img");
    img.id = "design-image";
    img.alt = "Design";
    img.style.width = "100%";
    img.style.height = "100%";
    designContainer.insertBefore(img, designContainer.firstChild);
  }
  img.src = imageUrl;
  designContainer.style.display = "block";
  // Apply existing transform state (do not reset)
  applyTransform(designContainer);
}
