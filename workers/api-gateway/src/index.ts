/// <reference types="@cloudflare/workers-types" />

import { Hono, Context, Next } from "hono";
import { cors } from "hono/cors";
import Stripe from "stripe";
import { z } from "zod";
import { Resend } from "resend";
import type { ExecutionContext as HonoExecutionContext } from "hono";
import * as Sentry from "@sentry/cloudflare";

/**
 * Defines the expected bindings and secrets available to the API Gateway worker.
 * Bindings are configured in wrangler.toml and secrets via `wrangler secret put`.
 */
export interface Env {
  /**
   * KV Namespace for storing application state, primarily token balances and temporary order details.
   * @binding STATE_KV
   */
  STATE_KV: KVNamespace;

  /**
   * R2 Bucket for storing user-uploaded images.
   * Must be configured for public read access if direct URLs are returned.
   * @binding IMAGE_BUCKET
   */
  IMAGE_BUCKET: R2Bucket;

  /**
   * Cloudflare Queue producer binding for sending token fulfillment jobs.
   * @binding TOKEN_QUEUE
   */
  TOKEN_QUEUE: Queue<TokenFulfillmentMessage>;

  /**
   * Cloudflare Queue producer binding for sending T-shirt order fulfillment jobs.
   * @binding ORDER_QUEUE
   */
  ORDER_QUEUE: Queue<OrderFulfillmentMessage>;

  // Secrets
  /**
   * Stripe API secret key (sk_...). Required for server-side Stripe operations.
   * @secret STRIPE_SECRET_KEY
   */
  STRIPE_SECRET_KEY: string;

  /**
   * Stripe webhook signing secret (whsec_...). Used to verify incoming webhook requests.
   * @secret STRIPE_WEBHOOK_SECRET
   */
  STRIPE_WEBHOOK_SECRET: string;

  /**
   * Comma-separated list of allowed origins for CORS requests.
   * Example: "http://localhost:3000,https://your-frontend.pages.dev"
   * @variable ALLOWED_ORIGINS (Configured in [vars] section of wrangler.toml)
   */
  ALLOWED_ORIGINS: string;

  /**
   * Printful API private access token. Required for catalog, shipping, and order APIs.
   * @secret PRINTFUL_API_KEY
   */
  PRINTFUL_API_KEY: string;

  /**
   * Printful Store ID. Required for API calls needing store context.
   * @secret PRINTFUL_STORE_ID
   */
  PRINTFUL_STORE_ID?: string; // Optional for now, handler should check

  /**
   * Resend API key. Required for sending transactional emails via Resend templates.
   * @secret RESEND_API_KEY
   */
  RESEND_API_KEY: string;
  /**
   * Template ID for Grant ID recovery emails in Resend.
   * @secret RESEND_TEMPLATE_GRANT_RECOVERY
   */
  RESEND_TEMPLATE_GRANT_RECOVERY: string;

  /**
   * x.ai API key. Required for calling the AI image generation endpoint.
   * @secret XAI_API_KEY
   */
  XAI_API_KEY: string;

  /**
   * The public base URL prefix for accessing files in the IMAGE_BUCKET.
   * Should not end with a slash.
   * Example: "https://pub-your-r2-id.r2.dev" or a custom domain.
   * @variable R2_PUBLIC_URL_PREFIX (Configured in [vars] section of wrangler.toml)
   */
  R2_PUBLIC_URL_PREFIX: string;

  // Sentry DSN
  SENTRY_DSN?: string;

  /**
   * PostHog Project API Key for sending backend events.
   * @secret POSTHOG_API_KEY
   */
  POSTHOG_API_KEY?: string;

  /**
   * PostHog instance host URL. Defaults to PostHog Cloud if not set.
   * Example: "https://us.posthog.com" or "https://your-self-hosted-posthog.com"
   * @secret POSTHOG_HOST_URL
   */
  POSTHOG_HOST_URL?: string;

  // Common convention for Cloudflare environment (staging/production)
  CF_WORKER_ENV?: string;
}

// Define types for Hono context variables set by middleware
type Variables = {
  stripe: Stripe;
};

// Define shared message type for queue
interface TokenFulfillmentMessage {
  grant_id: string;
  bundle_id: string;
  email: string;
  stripe_customer_id: string | null; // Track Stripe Customer
}

interface OrderFulfillmentMessage {
  payment_intent_id: string;
  email: string;
}

// Structure for storing token data in KV (consistent with queue-consumer)
interface TokenData {
  tokens_remaining: number;
  email?: string;
  stripe_customer_id?: string | null;
  last_updated?: string;
  last_bundle_purchased?: string;
}

// --- Constants ---
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB limit
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"];
const PRINTFUL_PRODUCTS_CACHE_TTL = 3600; // Cache Printful products for 1 hour (in seconds)

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// === Utilities ===
const generateGrantId = (): string => crypto.randomUUID();

const getTokenBundlePrice = (bundleId: string): number | null => {
  // Define token pricing (in cents)
  const prices: { [key: string]: number } = {
    tokens_10: 500, // Example: 10 tokens for €5.00
    tokens_50: 2000, // Example: 50 tokens for €20.00
    // Add more bundles as needed
  };
  return prices[bundleId] || null;
};

// === Input Schemas ===
const TokenPurchaseSchema = z.object({
  bundle_id: z.string().regex(/^(tokens_10|tokens_50)$/), // Example IDs
  email: z.string().email(),
});

const UploadSchema = z.object({
  image: z.instanceof(File), // Expecting a File object from FormData
});

const AiGenerateSchema = z.object({
  prompt: z.string().min(1).max(1000), // Define reasonable limits
  grant_id: z.string().uuid(),
});

const GrantIdParamSchema = z.object({
  grant_id: z.string().uuid(),
});

const EmailRecoverySchema = z.object({
  email: z.string().email(),
});

// Define schema for T-shirt order details
const TShirtOrderDetailsSchema = z.object({
  // Basic info calculated/selected on frontend
  total_amount_cents: z.number().int().positive(), // Total price in cents (including items, shipping, taxes)
  currency: z.literal("eur"),

  // Items in the order
  items: z
    .array(
      z.object({
        catalog_variant_id: z.number().int(), // Printful Variant ID
        quantity: z.number().int().positive(),
        design_url: z.string().url(), // URL of the design (R2 or AI generated)
        // TODO: Add placement details if needed (e.g., front, back, position)
      })
    )
    .min(1),

  // Shipping details
  shipping_address: z.object({
    name: z.string().min(1),
    email: z.string().email(), // Customer email
    address1: z.string().min(1),
    address2: z.string().optional(),
    city: z.string().min(1),
    state_code: z.string().optional(), // Or required based on country
    country_code: z.string().length(2), // ISO 2-letter country code
    zip: z.string().min(1),
  }),

  // Optional: Include chosen shipping option ID if pre-calculated
  shipping_option_id: z.string().optional(),
});

// Schema for Printful Shipping request body
const PrintfulShippingRequestSchema = z.object({
  recipient: z.object({
    address1: z.string().min(1),
    address2: z.string().optional(),
    city: z.string().min(1),
    state_code: z.string().optional(),
    country_code: z.string().length(2),
    zip: z.string().min(1),
  }),
  items: z
    .array(
      z.object({
        catalog_variant_id: z.number().int(), // Or use external_variant_id if known
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

// === Middleware ===

// CORS Middleware
// Adjust origins as needed for staging/production
app.use("/api/*", async (c, next) => {
  // Calculate allowedOrigins outside the origin function
  const allowedOrigins = c.env.ALLOWED_ORIGINS
    ? c.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
    : [];

  const corsMiddleware = cors({
    origin: (origin) => {
      // If no Origin header, allow (same-origin or non-browser requests)
      if (origin === undefined) return origin;
      // Check against allowed origins patterns
      for (const allowed of allowedOrigins) {
        // Full origin match (with protocol)
        if ((allowed.startsWith("http://") || allowed.startsWith("https://")) && origin === allowed) {
          return origin;
        }
        // Wildcard domain match (e.g., *.example.com)
        if (allowed.startsWith("*")) {
          try {
            const { host } = new URL(origin);
            const hostPattern = allowed.slice(1); // remove leading '*'
            if (host.endsWith(hostPattern)) {
              return origin;
            }
          } catch {
            // ignore invalid origin
          }
        }
        // Host-only match (no protocol, no wildcard)
        if (!allowed.includes("://") && !allowed.startsWith("*")) {
          try {
            const { host } = new URL(origin);
            if (host === allowed) {
              return origin;
            }
          } catch {
            // ignore invalid origin
          }
        }
      }
      // Not allowed
      return null;
    },
    allowMethods: ["GET", "POST", "OPTIONS", "HEAD"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposeHeaders: ["Content-Length", "Content-Type"],
    credentials: true,
    maxAge: 86400, // 24 hours
  });

  return corsMiddleware(c, next);
});

// OPTIONS requests handler for CORS preflight
// Use c.body(null, status) for empty responses
app.options("*", (c) => c.body(null, 204));

// Stripe client initialization middleware
// Explicitly type Context and Next here
app.use(
  "/api/stripe/*",
  async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next) => {
    // Check context using c.var (preferred way in newer Hono versions)
    // This avoids potential type issues with c.get/c.set if types aren't perfectly aligned
    if (!c.var.stripe) {
      if (!c.env.STRIPE_SECRET_KEY) {
        console.error("Stripe secret key not configured.");
        return c.json({ error: "Internal server configuration error" }, 500);
      }
      const stripeInstance = new Stripe(c.env.STRIPE_SECRET_KEY, {
        // Remove apiVersion to use library default
        httpClient: Stripe.createFetchHttpClient(),
      });
      // Use c.set to store in context
      c.set("stripe", stripeInstance);
    }
    await next();
  }
);

// === API Routes ===

// Health check
app.get("/", (c) => c.text("DruckMeinShirt API is running!"));

// POST /api/upload-image
app.post("/api/upload-image", async (c) => {
  if (!c.env.IMAGE_BUCKET || !c.env.R2_PUBLIC_URL_PREFIX) {
    console.error(
      "IMAGE_BUCKET or R2_PUBLIC_URL_PREFIX binding/variable missing."
    );
    return c.json({ error: "Server configuration error" }, 500);
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get("image");

    // Validate file presence and type
    if (!file || !(file instanceof File)) {
      return c.json({ error: "Missing image file in FormData" }, 400);
    }

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return c.json(
        {
          error: `Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.join(
            ", "
          )}`,
        },
        400
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return c.json(
        {
          error: `File size exceeds limit of ${
            MAX_FILE_SIZE_BYTES / 1024 / 1024
          }MB`,
        },
        400
      );
    }

    // Generate unique key
    const fileExtension = file.type === "image/png" ? ".png" : ".jpg";
    const uniqueKey = `${crypto.randomUUID()}${fileExtension}`;

    // Upload to R2
    try {
      await c.env.IMAGE_BUCKET.put(uniqueKey, file.stream(), {
        httpMetadata: { contentType: file.type },
        // Add custom metadata if needed
        // customMetadata: { uploadedBy: 'user-session-id' },
      });
      console.log(`Successfully uploaded image to R2 with key: ${uniqueKey}`);
    } catch (r2Error: any) {
      console.error(`R2 put error for key ${uniqueKey}:`, r2Error);
      return c.json({ error: "Failed to store uploaded image" }, 500);
    }

    // Construct public URL (ensure no double slashes)
    const publicUrl = `${c.env.R2_PUBLIC_URL_PREFIX.replace(
      /\/$/,
      ""
    )}/${uniqueKey}`;

    return c.json({ imageUrl: publicUrl });
  } catch (error: any) {
    console.error("Error processing image upload:", error);
    return c.json({ error: "Internal server error during upload" }, 500);
  }
});

/**
 * @endpoint POST /api/generate-image
 * @description Generates images using the x.ai API based on a user prompt.
 * Requires a valid grant_id with sufficient tokens.
 * Deducts one token upon successful request initiation.
 * Attempts to revert token deduction if the x.ai API call fails.
 *
 * @requestBody {AiGenerateSchema} JSON object containing `prompt` and `grant_id`.
 * @response 200 OK - { images: string[] } - Array of generated image URLs.
 * @response 400 Bad Request - Invalid input or grant ID.
 * @response 402 Payment Required - Insufficient tokens for the given grant ID.
 * @response 500 Internal Server Error - KV error, configuration error.
 * @response 502 Bad Gateway - Upstream x.ai API failed.
 */
app.post("/api/generate-image", async (c) => {
  // Check essential configuration
  if (!c.env.XAI_API_KEY || !c.env.STATE_KV) {
    console.error("XAI_API_KEY or STATE_KV binding missing.");
    // Throw configuration errors to be caught by the main handler (and potentially Sentry)
    throw new Error("Server configuration error [AI Gen]");
  }

  try {
    // Validate request body using Zod schema
    const body = await c.req.json();
    const validation = AiGenerateSchema.safeParse(body);
    if (!validation.success) {
      // Return specific validation errors to the client
      return c.json(
        { error: "Invalid input", details: validation.error.errors },
        400
      );
    }
    const { prompt, grant_id } = validation.data;

    // --- Token Validation ---
    // Retrieve current token data associated with the grant ID from KV
    const tokenData = await c.env.STATE_KV.get<TokenData>(grant_id, {
      type: "json",
    });
    if (!tokenData) {
      // Grant ID not found in KV
      return c.json({ error: "Invalid grant ID" }, 400);
    }
    if (tokenData.tokens_remaining <= 0) {
      // User has no tokens left with this grant ID
      return c.json({ error: "Insufficient tokens" }, 402);
    }

    // --- Token Decrement ---
    // Store original count for potential revert
    const originalTokens = tokenData.tokens_remaining;
    // Prepare updated data
    const updatedTokenData: TokenData = {
      ...tokenData,
      tokens_remaining: originalTokens - 1,
      last_updated: new Date().toISOString(),
    };
    // Attempt to write the decremented value back to KV
    // Let potential KV errors throw to be caught below
    await c.env.STATE_KV.put(grant_id, JSON.stringify(updatedTokenData));
    console.log(
      `Decremented token for grant_id ${grant_id}. New balance: ${updatedTokenData.tokens_remaining}`
    );

    // --- x.ai API Call ---
    const xaiUrl = "https://api.x.ai/v1/images/generations";
    const xaiPayload = {
      model: "grok-2-image",
      prompt: prompt,
      n: 4, // Generate 4 images
      response_format: "url", // Request URLs directly
    };
    let xaiResponse: Response;
    try {
      // Perform the fetch request to the x.ai API
      xaiResponse = await fetch(xaiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.XAI_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(xaiPayload),
      });

      // Check if the API call was successful
      if (!xaiResponse.ok) {
        // If x.ai returns an error, log it and throw to trigger token revert
        const errorBodyText = await xaiResponse.text();
        console.error(
          `x.ai API Error: ${xaiResponse.status} ${xaiResponse.statusText}`,
          errorBodyText
        );
        throw new Error(`x.ai API failed with status ${xaiResponse.status}`); // Caught by outer catch
      }

      // Parse successful response
      const result = (await xaiResponse.json()) as any; // TODO: Define specific type for x.ai response
      const imageUrls = result?.data?.map((item: any) => item.url) || [];
      const revisedPrompt = result?.data?.[0]?.revised_prompt;

      // Log the revised prompt if provided by the API
      if (revisedPrompt) {
        console.log(
          `x.ai revised prompt for grant_id ${grant_id}: ${revisedPrompt}`
        );
      }
      console.log(
        `Successfully generated ${imageUrls.length} images for grant_id ${grant_id}`
      );

      // --- Track Successful Generation ---
      sendPostHogEvent(
        c.env,
        c.executionCtx,
        grant_id,
        "ai_image_generated_backend",
        {
          prompt_used: prompt,
          num_images_returned: imageUrls.length,
          // revised_prompt: revisedPrompt, // Add if needed
        }
      );

      // Return the image URLs to the client
      return c.json({ images: imageUrls });
    } catch (fetchError: any) {
      // --- Handle x.ai API Failure ---
      console.error(
        `Error calling x.ai API for grant_id ${grant_id}:`,
        fetchError
      );

      // Attempt to revert the token decrement because the API call failed
      console.warn(
        `Attempting to revert token decrement for grant_id ${grant_id} due to API failure.`
      );
      try {
        // Create the original token data object (can reuse tokenData fetched earlier)
        tokenData.last_updated = new Date().toISOString(); // Still update timestamp
        await c.env.STATE_KV.put(grant_id, JSON.stringify(tokenData));
        console.log(
          `Successfully reverted token count for grant_id ${grant_id} to ${originalTokens}`
        );
      } catch (revertKvError: any) {
        // This is critical - the user was charged a token, the API failed, AND the revert failed.
        // Requires monitoring and manual intervention.
        console.error(
          `CRITICAL: Failed to revert token decrement for grant_id ${grant_id} after API error:`,
          revertKvError
        );
        // Sentry (if active) should catch the original fetchError below.
      }

      // Re-throw the original error (fetchError) that caused this block to execute.
      // This ensures the main error handler catches the *root cause* of the failure.
      throw fetchError;
    }
  } catch (error: any) {
    // Catch errors from initial validation, KV operations, or re-thrown fetch errors
    console.error("Error within /api/generate-image handler:", error);
    // Re-throw the error to be caught by the main fetch handler (and Sentry wrapper)
    throw error;
  }
});

// Interfaces from Printful API Response (add/modify to include placements)
interface PrintfulPlacement {
  placement: string; // e.g., "front", "back"
  print_area_width: number; // In PIXELS
  print_area_height: number; // In PIXELS
  // Potentially other fields like supported techniques, options etc.
}

interface PrintfulVariant {
  id: number;
  name: string;
  size: string;
  color: string;
  color_code: string;
  image: string; // URL to variant image
  price: number;
  in_stock: boolean;
}

interface PrintfulProduct {
  id: number;
  title: string;
  description: string;
  brand: string | null;
  model: string | null;
  image: string;
  variants: PrintfulVariant[];
  placements?: PrintfulPlacement[]; // Make optional in case some products lack it
}

// --- Formatted Product Types (for Frontend) ---
interface FormattedPlacement {
  placement: string;
  print_area_width_px: number; // Store original pixels
  print_area_height_px: number; // Store original pixels
}

interface FormattedVariant {
  id: number;
  size: string;
  color: string;
  color_code: string;
  in_stock: boolean;
  image_url?: string; // Add variant specific image URL
}

interface FormattedProduct {
  id: number;
  name: string;
  description: string;
  brand: string | null;
  model: string | null;
  default_image_url: string;
  available_sizes: string[];
  available_colors: { name: string; code: string }[];
  variants: FormattedVariant[];
  placements: FormattedPlacement[]; // Add placements array
}

// GET /api/printful/products
app.get("/api/printful/products", async (c) => {
  try {
    // Ensure Printful API key and KV binding are configured
    if (!c.env.PRINTFUL_API_KEY || !c.env.STATE_KV) {
      console.error(
        "PRINTFUL_API_KEY or STATE_KV binding/secret missing."
      );
      return c.json({ error: "Server configuration error" }, 500);
    }

    let cacheHit = false;

    // --- Query Parameter Handling ---
    const limitQuery = c.req.query("limit");
    const offsetQuery = c.req.query("offset");
    const categoryIdQuery = c.req.query("category_id");
    const limit = limitQuery ? parseInt(limitQuery, 10) : 20;
    const offset = offsetQuery ? parseInt(offsetQuery, 10) : 0;
    const categoryId = categoryIdQuery ? categoryIdQuery : null;

    if (
      isNaN(limit) ||
      limit <= 0 ||
      limit > 100 ||
      isNaN(offset) ||
      offset < 0
    ) {
      return c.json({ error: "Invalid pagination parameters." }, 400);
    }

    // --- KV Caching Logic ---
    const cacheKey = `printful:products:l=${limit}:o=${offset}${categoryId ? `:c=${categoryId}` : ""}`;
    const cachedData = await c.env.STATE_KV.get<FormattedProduct[]>(cacheKey, {
      type: "json",
    });
    if (cachedData) {
      console.log(`Cache hit for Printful products: ${cacheKey}`);
      cacheHit = true;
      c.header("X-Cache", "hit");
      return c.json({ products: cachedData });
    }

    console.log(
      `Cache miss for Printful products: ${cacheKey}. Fetching from API.`
    );
    c.header("X-Cache", "miss");

    // --- Fetch from Printful API ---
    // Build query parameters for Printful catalog API
    const queryParams = new URLSearchParams();
    queryParams.set("limit", limit.toString());
    queryParams.set("offset", offset.toString());
    if (categoryId) {
      queryParams.set("category_id", categoryId);
    }
    // Set selling region: use provided query param or default to EU
    const regionParam = c.req.query("region") || "EU";
    queryParams.set("region", regionParam);

    // Fetch catalog products (no store context required)
    const response = await printfulRequestGateway(
      c.env.PRINTFUL_API_KEY,
      "GET",
      "/catalog/products",
      queryParams
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Printful API Error (Get Products): ${response.status}`,
        errorBody
      );
      return c.json(
        { error: "Failed to fetch products from Printful provider" },
        500
      );
    }
    const result = (await response.json()) as {
      code: number;
      data: PrintfulProduct[];
    };
    if (result.code !== 200 || !Array.isArray(result.data)) {
      console.error("Unexpected Printful API response format:", result);
      return c.json(
        { error: "Invalid response format from Printful provider" },
        500
      );
    }

    // --- Format Response ---
    const formattedProducts: FormattedProduct[] = result.data.map(
      (product: PrintfulProduct) => {
        const availableSizes = [
          ...new Set(product.variants.map((v) => v.size)),
        ].sort();
        const availableColors = product.variants
          .reduce(
            (acc, v) => {
              if (!acc.some((c) => c.name === v.color)) {
                acc.push({ name: v.color, code: v.color_code });
              }
              return acc;
            },
            [] as { name: string; code: string }[]
          )
          .sort((a, b) => a.name.localeCompare(b.name));

        const variants: FormattedVariant[] = product.variants.map((v) => ({
          id: v.id,
          size: v.size,
          color: v.color,
          color_code: v.color_code,
          in_stock: v.in_stock,
          image_url: v.image,
        }));

        const placements: FormattedPlacement[] = (product.placements || []).map(
          (p) => ({
            placement: p.placement,
            print_area_width_px: p.print_area_width,
            print_area_height_px: p.print_area_height,
          })
        );

        return {
          id: product.id,
          name: product.title,
          description: product.description,
          brand: product.brand,
          model: product.model,
          default_image_url: product.image,
          available_sizes: availableSizes,
          available_colors: availableColors,
          variants: variants,
          placements: placements,
        };
      }
    );

    // --- Store in Cache ---
    c.executionCtx.waitUntil(
      c.env.STATE_KV.put(cacheKey, JSON.stringify(formattedProducts), {
        expirationTtl: PRINTFUL_PRODUCTS_CACHE_TTL,
      })
        .then(() =>
          console.log(`Stored Printful products in cache: ${cacheKey}`)
        )
        .catch((err) =>
          console.error(
            `Failed to cache Printful products for key ${cacheKey}:`,
            err
          )
        )
    );

    return c.json({ products: formattedProducts });
  } catch (error: any) {
    console.error("Error in /api/printful/products route:", error);
    // Ensure a JSON error response is sent
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal server error fetching products",
      },
      500
    );
  }
});

// POST /api/printful/shipping-options
app.post("/api/printful/shipping-options", async (c) => {
  if (!c.env.PRINTFUL_API_KEY || !c.env.PRINTFUL_STORE_ID) {
    console.error("PRINTFUL_API_KEY or PRINTFUL_STORE_ID not set.");
    return c.json({ error: "Server configuration error" }, 500);
  }

  try {
    const body = await c.req.json();
    const validation = PrintfulShippingRequestSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          error: "Invalid shipping request format",
          details: validation.error.errors,
        },
        400
      );
    }

    const endpoint = "/shipping/rates";
    const response = await printfulRequestGateway(
      c.env.PRINTFUL_API_KEY,
      "POST",
      endpoint,
      undefined,
      validation.data,
      c.env.PRINTFUL_STORE_ID
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Printful API Error (Shipping Rates): ${response.status}`,
        errorBody
      );
      return c.json(
        { error: "Failed to calculate shipping rates via provider" },
        500
      );
    }

    const result = (await response.json()) as any;
    const shippingOptions = result?.data || [];
    return c.json({ shipping_options: shippingOptions });
  } catch (error: any) {
    console.error("Error calculating Printful shipping options:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Placeholder for Stripe token purchase intent
app.post(
  "/api/stripe/create-token-purchase-intent",
  async (c: Context<{ Bindings: Env; Variables: Variables }>) => {
    // Retrieve stripe instance from context using c.var
    const stripe = c.var.stripe;
    try {
      const body = await c.req.json();
      const validation = TokenPurchaseSchema.safeParse(body);

      if (!validation.success) {
        return c.json(
          { error: "Invalid input", details: validation.error.errors },
          400
        );
      }

      const { bundle_id, email } = validation.data;
      const price = getTokenBundlePrice(bundle_id);

      if (price === null) {
        return c.json({ error: "Invalid bundle ID" }, 400);
      }

      let customer = await stripe.customers
        .list({ email: email, limit: 1 })
        .then((res) => res.data[0]);
      if (!customer) {
        customer = await stripe.customers.create({ email: email });
      }

      const grant_id = generateGrantId();

      const paymentIntent = await stripe.paymentIntents.create({
        amount: price,
        currency: "eur",
        customer: customer.id,
        metadata: {
          purchase_type: "tokens",
          bundle_id: bundle_id,
          grant_id: grant_id,
        },
        payment_method_types: ["card", "sofort", "giropay"],
      });

      return c.json({
        client_secret: paymentIntent.client_secret,
        grant_id: grant_id,
      });
    } catch (error: any) {
      console.error("Error creating token purchase intent:", error);
      return c.json({ error: "Failed to create payment intent" }, 500);
    }
  }
);

// Placeholder for Stripe t-shirt order intent
app.post(
  "/api/stripe/create-tshirt-order-intent",
  async (c: Context<{ Bindings: Env; Variables: Variables }>) => {
    // Retrieve stripe instance from context using c.var
    const stripe = c.var.stripe;
    try {
      const body = await c.req.json();
      const validation = TShirtOrderDetailsSchema.safeParse(body);

      if (!validation.success) {
        return c.json(
          { error: "Invalid order details", details: validation.error.errors },
          400
        );
      }

      const orderDetails = validation.data;
      const { email } = orderDetails.shipping_address;

      if (!c.env.ORDER_QUEUE || !c.env.STATE_KV) {
        console.error("ORDER_QUEUE or STATE_KV binding missing.");
        throw new Error("Server configuration error [T-shirt Intent]");
      }

      let customer = await stripe.customers
        .list({ email: email, limit: 1 })
        .then((res) => res.data[0]);
      if (!customer) {
        customer = await stripe.customers.create({ email: email });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: orderDetails.total_amount_cents,
        currency: orderDetails.currency,
        customer: customer.id,
        metadata: {
          purchase_type: "tshirt",
        },
        payment_method_types: ["card", "sofort", "giropay"],
        description: "DruckMeinShirt T-Shirt Order",
      });

      if (paymentIntent.id) {
        try {
          await c.env.STATE_KV.put(
            `order:${paymentIntent.id}`,
            JSON.stringify(orderDetails),
            { expirationTtl: 86400 }
          );
          console.log(`Stored order details in KV for PI: ${paymentIntent.id}`);
        } catch (kvError: any) {
          console.error(
            `Failed to store order details in KV for PI ${paymentIntent.id}:`,
            kvError
          );
          throw kvError;
        }
      } else {
        console.error("Payment Intent ID missing after creation.");
        throw new Error("Payment Intent ID missing after creation.");
      }

      return c.json({ client_secret: paymentIntent.client_secret });
    } catch (error: any) {
      console.error("Error creating T-shirt order intent:", error);
      return c.json({ error: "Failed to create payment intent" }, 500);
    }
  }
);

// POST /api/stripe/webhook
app.post(
  "/api/stripe/webhook",
  async (c: Context<{ Bindings: Env; Variables: Variables }>) => {
    const stripe = c.var.stripe;
    const signature = c.req.header("stripe-signature");

    if (!stripe || !c.env.STRIPE_WEBHOOK_SECRET || !signature) {
      console.error(
        "Webhook prerequisites missing (Stripe instance, secret, or signature)."
      );
      throw new Error("Webhook configuration error"); // Throw config error
    }

    try {
      const body = await c.req.text();
      let event: Stripe.Event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        c.env.STRIPE_WEBHOOK_SECRET,
        undefined,
        Stripe.createSubtleCryptoProvider()
      );

      switch (event.type) {
        case "payment_intent.succeeded":
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          console.log(`PaymentIntent ${paymentIntent.id} succeeded.`);

          const purchaseType = paymentIntent.metadata?.purchase_type;
          let customerEmail: string | null | undefined = null;
          let stripeCustomerId: string | undefined = undefined;

          // Safely retrieve customer and email
          if (typeof paymentIntent.customer === "string") {
            try {
              const customer = await stripe.customers.retrieve(
                paymentIntent.customer
              );
              // Check if the customer object is not deleted before accessing email
              if (customer && !customer.deleted) {
                customerEmail = customer.email;
                stripeCustomerId = customer.id;
              } else {
                console.warn(
                  `Retrieved customer ${paymentIntent.customer} for PI ${paymentIntent.id} is deleted or invalid.`
                );
              }
            } catch (customerError: any) {
              console.error(
                `Failed to retrieve customer ${paymentIntent.customer} for PI ${paymentIntent.id}:`,
                customerError
              );
              // Decide if this is fatal - likely yes, as we need the email.
            }
          } else if (paymentIntent.customer) {
            // Handle case where customer object might be expanded (though less common for PI succeeded)
            if (!paymentIntent.customer.deleted) {
              customerEmail = paymentIntent.customer.email;
              stripeCustomerId = paymentIntent.customer.id;
            } else {
              console.warn(
                `Expanded customer object for PI ${paymentIntent.id} is marked as deleted.`
              );
            }
          }

          if (!customerEmail) {
            console.error(
              `Could not determine a valid customer email for PaymentIntent ${paymentIntent.id}. Cannot queue fulfillment.`
            );
            // Acknowledge event to Stripe, but log critical error.
            return c.json({
              received: true,
              error: "Missing or invalid customer email",
            });
          }

          try {
            if (purchaseType === "tokens") {
              const { grant_id, bundle_id } = paymentIntent.metadata;
              if (!grant_id || !bundle_id) {
                console.error(
                  `Missing grant_id or bundle_id in metadata for token PaymentIntent ${paymentIntent.id}`
                );
                return c.json({
                  received: true,
                  error: "Missing token metadata",
                });
              }
              if (!c.env.TOKEN_QUEUE) {
                console.error("TOKEN_QUEUE binding missing.");
                return c.json({
                  received: true,
                  error: "Server configuration error",
                });
              }
              const message: TokenFulfillmentMessage = {
                grant_id: grant_id,
                bundle_id: bundle_id,
                email: customerEmail,
                stripe_customer_id: stripeCustomerId ?? null,
              };
              await c.env.TOKEN_QUEUE.send(message);
              console.log(
                `Enqueued token fulfillment job for grant_id: ${grant_id}`
              );
            } else if (purchaseType === "tshirt") {
              if (!c.env.ORDER_QUEUE) {
                console.error("ORDER_QUEUE binding missing.");
                return c.json({
                  received: true,
                  error: "Server configuration error",
                });
              }
              const message: OrderFulfillmentMessage = {
                payment_intent_id: paymentIntent.id,
                email: customerEmail,
              };
              await c.env.ORDER_QUEUE.send(message);
              console.log(
                `Enqueued order fulfillment job for PaymentIntent: ${paymentIntent.id}`
              );
            } else {
              console.warn(
                `Received successful PaymentIntent ${paymentIntent.id} with unknown purchase_type: ${purchaseType}`
              );
            }
          } catch (queueError: any) {
            console.error(
              `Failed to enqueue fulfillment job for PaymentIntent ${paymentIntent.id}:`,
              queueError
            );
            throw queueError;
          }
          break;
        default:
      }

      return c.json({ received: true });
    } catch (error: any) {
      console.error(
        "Error processing webhook (signature or queue error):",
        error
      );
      throw error;
    }
  }
);

// GET /api/token-balance/:grant_id
app.get(
  "/api/token-balance/:grant_id", // Restored original path
  async (c: Context<{ Bindings: Env; Variables: Variables }>) => {
    // Check necessary binding
    if (!c.env.STATE_KV) {
      console.error("STATE_KV binding missing.");
      return c.json({ error: "Server configuration error" }, 500);
    }

    try {
      // Original param validation
      const params = GrantIdParamSchema.safeParse(c.req.param());
      if (!params.success) {
        return c.json(
          {
            error: "Invalid grant ID format in URL",
            details: params.error.errors,
          },
          400
        );
      }
      const grant_id = params.data.grant_id;
      // Removed console log for test

      // Fetch token data from KV
      const tokenData = await c.env.STATE_KV.get<TokenData>(grant_id, {
        type: "json",
      });

      // Return remaining tokens, or 0 if grant_id not found
      const tokensRemaining = tokenData?.tokens_remaining ?? 0; // Reverted -1 to 0 for not found
      // Removed console log for test

      // --- Send PostHog Event ---
      sendPostHogEvent(
        c.env,
        c.executionCtx,
        grant_id,
        "token_balance_checked"
      ); // Restored original event name
      // --- End PostHog Event ---

      return c.json({ tokens_remaining: tokensRemaining });
    } catch (error: any) {
      console.error("Error fetching token balance:", error);
      return c.json(
        { error: "Internal server error retrieving token balance" }, // Restored original message
        500
      );
    }
  }
);

// POST /api/recover-grant-id
app.post(
  "/api/recover-grant-id",
  async (c: Context<{ Bindings: Env; Variables: Variables }>) => {
    if (!c.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY missing for grant recovery.");
      return c.json({
        message:
          "If a matching purchase was found, recovery instructions have been sent to your email.",
      });
    }

    try {
      const body = await c.req.json();
      const validation = EmailRecoverySchema.safeParse(body);

      if (!validation.success) {
        console.warn("Invalid email format received for grant recovery.");
        // Don't reveal specific validation errors
        return c.json({
          message:
            "If a matching purchase was found, recovery instructions have been sent to your email.",
        });
      }

      const email = validation.data.email; // Define email here, outside the inner try

      // Put the rest of the logic inside a separate try-catch for better error scoping
      try {
        if (!c.env.STRIPE_SECRET_KEY) {
          console.error("STRIPE_SECRET_KEY missing for grant recovery.");
          return c.json({ message: "Configuration error." }, 500); // Return generic success later
        }

        const stripeClient = new Stripe(c.env.STRIPE_SECRET_KEY, {
          httpClient: Stripe.createFetchHttpClient(),
        });

        console.log(`Searching Stripe for token purchases by ${email}`);
        const paymentIntents = await stripeClient.paymentIntents.list({
          limit: 20,
        });
        const successfulTokenPurchases = paymentIntents.data.filter(
          (pi) =>
            pi.status === "succeeded" &&
            pi.metadata.purchase_type === "tokens" &&
            pi.metadata.grant_id && // Ensure grant_id exists
            (pi.customer === null || pi.receipt_email === email) // Check receipt email or customer email
        );
        const foundGrantIds = successfulTokenPurchases.map(
          (pi) => pi.metadata.grant_id
        );

        if (foundGrantIds.length === 0) {
          console.log(`No successful token purchases found for ${email}`);
          return c.json({
            message: "Recovery instructions sent if match found.",
          });
        }

        const uniqueGrantIds = [...new Set(foundGrantIds)];
        console.log(`Found grant IDs for ${email}:`, uniqueGrantIds);

        // Send email
        const resend = new Resend(c.env.RESEND_API_KEY);
        if (!c.env.RESEND_TEMPLATE_GRANT_RECOVERY) {
          console.error("RESEND_TEMPLATE_GRANT_RECOVERY not configured.");
        } else {
          // Send email using template ID via raw POST to satisfy type definitions
          await resend.post("/emails", {
            from: "DruckMeinShirt Recovery <noreply@yourdomain.com>",
            to: [email],
            template_id: c.env.RESEND_TEMPLATE_GRANT_RECOVERY,
            template_data: { grant_ids: uniqueGrantIds },
          });
        }

        console.log(`Sent recovery email to ${email}`);
        return c.json({
          message: "Recovery instructions sent if match found.",
        });
      } catch (innerError: any) {
        // Log the inner error with the email context
        console.error(
          `Error during grant ID recovery process for ${email}:`,
          innerError
        );
        // Return the generic success message to the user regardless of inner failure
        return c.json({
          message:
            "If a matching purchase was found, recovery instructions have been sent to your email.",
        });
      }
    } catch (outerError: any) {
      // Catch errors reading/parsing the request body itself
      console.error(
        `Error parsing request body for grant recovery:`,
        outerError
      );
      // Return a generic error or the standard success message if preferred
      return c.json({ error: "Bad request format" }, 400);
    }
  }
);

// --- Error Handling ---
app.onError((err, c) => {
  console.error("Hono Global Error Handler:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// --- Simple Worker Export (No Sentry Wrapper due to type issues) ---
export default {
  fetch: app.fetch, // Use Hono's fetch handler directly
};

// --- Printful API Client Helper (for API Gateway) ---

const PRINTFUL_API_BASE_GW = "https://api.printful.com/v2"; // Avoid name clash if ever merged

async function printfulRequestGateway(
  apiKey: string,
  method: string,
  endpoint: string,
  queryParams?: URLSearchParams,
  body?: any,
  storeId?: string
): Promise<Response> {
  let url = `${PRINTFUL_API_BASE_GW}${endpoint}`;
  if (queryParams) {
    url += `?${queryParams.toString()}`;
  }

  const headers: HeadersInit = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Add Store ID header if provided
  if (storeId) {
    headers["X-PF-Store-Id"] = storeId;
  }

  console.log(
    `Printful API Request (GW): ${method} ${url}` +
      (storeId ? ` Store: ${storeId}` : "") +
      (body ? ` Body: ${JSON.stringify(body).substring(0, 100)}...` : "")
  );

  const response = await fetch(url, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  console.log(
    `Printful API Response (GW): ${response.status} ${response.statusText}`
  );
  return response;
}

// --- PostHog Helper ---
/**
 * Sends an event asynchronously to the PostHog capture endpoint.
 * Uses `ctx.waitUntil` to ensure the event sending doesn't block the response.
 * Logs errors to the console if the API key is missing or the fetch fails.
 *
 * @param {Env} env - The worker environment object containing secrets/vars.
 * @param {HonoExecutionContext | undefined} ctx - Hono's execution context (provides waitUntil).
 * @param {string} distinctId - The unique identifier for the user/entity associated with the event.
 * @param {string} eventName - The name of the event being tracked.
 * @param {Record<string, any>} [properties] - Optional additional properties for the event.
 */
async function sendPostHogEvent(
  env: Env,
  ctx: HonoExecutionContext | undefined,
  distinctId: string,
  eventName: string,
  properties?: Record<string, any>
) {
  if (!env.POSTHOG_API_KEY) {
    // console.log("PostHog API Key not set, skipping event.");
    return;
  }
  const posthogHost = env.POSTHOG_HOST_URL || "https://app.posthog.com"; // Default to cloud

  const payload = {
    api_key: env.POSTHOG_API_KEY,
    event: eventName,
    distinct_id: distinctId,
    properties: {
      $host: posthogHost,
      worker: "api-gateway", // Identify source worker
      ...(properties || {}),
    },
    timestamp: new Date().toISOString(),
  };

  const request = new Request(`${posthogHost}/capture/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  // Send asynchronously using waitUntil from Hono's context
  if (ctx) {
    ctx.waitUntil(
      fetch(request).catch((err) =>
        console.error("Error sending PostHog event:", err)
      )
    );
  } else {
    fetch(request).catch((err) =>
      console.error("Error sending PostHog event (no ctx):", err)
    );
  }
}
