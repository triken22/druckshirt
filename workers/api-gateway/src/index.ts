/// <reference types="@cloudflare/workers-types" />

import { Hono } from "hono";
import { cors } from "hono/cors";

// Define types for bindings and secrets
export interface Env {
  STATE_KV: KVNamespace;
  IMAGE_BUCKET: R2Bucket;
  TOKEN_QUEUE: Queue;
  ORDER_QUEUE: Queue;

  // Secrets (Injected via wrangler secrets or GitHub Actions)
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  PRINTFUL_API_KEY: string;
  RESEND_API_KEY: string;
  XAI_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

// === CORS Middleware ===
// Adjust origins as needed for staging/production
app.use(
  "/api/*",
  cors({
    origin: [
      "http://localhost:3000",
      "https://investorio-staging.pages.dev",
      "https://investorio.ai",
    ], // Updated origins
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"], // Add others if needed
    maxAge: 600,
    credentials: true,
  })
);

// === API Routes ===

// Simple health check
app.get("/api/health", (c) => c.json({ ok: true }));

// Placeholder for image generation
app.post("/api/generate-image", async (c) => {
  // TODO: Implement logic from instruct.txt
  console.log("Received /api/generate-image request");
  return c.json({ message: "Not implemented yet" }, 501);
});

// Placeholder for image upload
app.post("/api/upload-image", async (c) => {
  // TODO: Implement logic from instruct.txt
  console.log("Received /api/upload-image request");
  return c.json({ message: "Not implemented yet" }, 501);
});

// Placeholder for Printful products
app.get("/api/printful/products", async (c) => {
  // TODO: Implement logic from instruct.txt
  console.log("Received /api/printful/products request");
  return c.json({ message: "Not implemented yet" }, 501);
});

// Placeholder for Printful shipping options
app.post("/api/printful/shipping-options", async (c) => {
  // TODO: Implement logic from instruct.txt
  console.log("Received /api/printful/shipping-options request");
  return c.json({ message: "Not implemented yet" }, 501);
});

// Placeholder for Stripe token purchase intent
app.post("/api/stripe/create-token-purchase-intent", async (c) => {
  // TODO: Implement logic from instruct.txt
  console.log("Received /api/stripe/create-token-purchase-intent request");
  return c.json({ message: "Not implemented yet" }, 501);
});

// Placeholder for Stripe t-shirt order intent
app.post("/api/stripe/create-tshirt-order-intent", async (c) => {
  // TODO: Implement logic from instruct.txt
  console.log("Received /api/stripe/create-tshirt-order-intent request");
  return c.json({ message: "Not implemented yet" }, 501);
});

// Placeholder for Stripe webhook
app.post("/api/stripe/webhook", async (c) => {
  // TODO: Implement logic from instruct.txt
  console.log("Received /api/stripe/webhook request");
  return c.json({ received: true });
});

// Placeholder for getting token balance
app.get("/api/get-token-balance", async (c) => {
  // TODO: Implement logic from instruct.txt
  const grantId = c.req.query("grant_id");
  console.log(
    `Received /api/get-token-balance request for grant_id: ${grantId}`
  );
  return c.json({ message: "Not implemented yet" }, 501);
});

// Placeholder for grant ID recovery
app.post("/api/recover-grant-id", async (c) => {
  // TODO: Implement logic from instruct.txt
  console.log("Received /api/recover-grant-id request");
  return c.json({
    message:
      "If a matching purchase was found, recovery instructions have been sent to your email.",
  });
});

// === Error Handling ===
app.onError((err, c) => {
  console.error(`${err}`);
  // TODO: Add more robust error logging/reporting (e.g., to Sentry/monitoring service)
  return c.json({ error: "Internal Server Error", message: err.message }, 500);
});

export default app;
