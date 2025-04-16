import posthog from 'posthog-js';
import { CONFIG } from './config.js';

/**
 * Initialize PostHog analytics.
 * Should be called once on app startup.
 */
export function initAnalytics() {
  posthog.init(CONFIG.POSTHOG.API_KEY, {
    api_host: CONFIG.POSTHOG.HOST_URL,
    autocapture: true,
    capture_pageview: true,
  });
}

/**
 * Track a custom event with PostHog.
 * @param {string} event - Event name.
 * @param {Object} [props={}] - Event properties.
 */
export function trackEvent(event, props = {}) {
  posthog.capture(event, props);
}

/**
 * Track a pageview event.
 * @param {string} [path=window.location.pathname] - Optional override path.
 */
export function trackPageView(path = window.location.pathname) {
  posthog.capture('$pageview', { path });
}

/**
 * Opt the user out of analytics tracking.
 */
export function optOutAnalytics() {
  posthog.opt_out_capturing();
}

/**
 * Opt the user into analytics tracking.
 */
export function optInAnalytics() {
  posthog.opt_in_capturing();
}