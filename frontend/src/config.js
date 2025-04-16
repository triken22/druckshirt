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
export const CONFIG = {
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
export const ErrorTypes = {
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
export class AppError extends Error {
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
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,
  MAX_DELAY: 5000,
  BACKOFF_FACTOR: 2,
};


