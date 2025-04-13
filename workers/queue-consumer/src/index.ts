/// <reference types="@cloudflare/workers-types" />

import { Resend } from "resend";
import { Toucan } from "toucan-js";

// Define types for bindings and secrets
export interface Env {
  STATE_KV: KVNamespace;

  // Secrets (Injected via wrangler secrets or GitHub Actions)
  STRIPE_SECRET_KEY: string; // Needed if interacting with Stripe API here
  PRINTFUL_API_KEY: string;
  RESEND_API_KEY: string;
  SENTRY_DSN?: string;
  // PostHog Secrets
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST_URL?: string;
}

// Define the expected message body structure for each queue
interface TokenFulfillmentMessage {
  grant_id: string;
  bundle_id: string;
  email: string;
  stripe_customer_id: string | null;
}

interface OrderFulfillmentMessage {
  payment_intent_id: string;
  email: string;
  // Add other relevant fields if needed, like Stripe Customer ID
}

// Define structure for storing token data in KV
interface TokenData {
  tokens_remaining: number;
  email?: string;
  stripe_customer_id?: string | null;
  // Add other fields like purchase date, last updated etc. if needed
}

// Structure for T-shirt order details stored temporarily in KV
// (Should match TShirtOrderDetailsSchema from api-gateway)
interface TShirtOrderDetails {
  total_amount_cents: number;
  currency: "eur";
  items: Array<{
    catalog_variant_id: number;
    quantity: number;
    design_url: string;
    // placement details if added later
  }>;
  shipping_address: {
    name: string;
    email: string;
    address1: string;
    address2?: string;
    city: string;
    state_code?: string;
    country_code: string;
    zip: string;
  };
  shipping_option_id?: string;
}

const getTokenAmount = (bundleId: string): number | null => {
  // Define token amounts per bundle
  const amounts: { [key: string]: number } = {
    tokens_10: 10,
    tokens_50: 50,
    // Must match prices defined in api-gateway
  };
  return amounts[bundleId] || null;
};

// --- Printful API Client (Basic Example) ---

const PRINTFUL_API_BASE = "https://api.printful.com/v2";

async function printfulRequest(
  apiKey: string,
  method: string,
  endpoint: string,
  body?: any
): Promise<Response> {
  const url = `${PRINTFUL_API_BASE}${endpoint}`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  console.log(
    `Printful API Request: ${method} ${url}` +
      (body ? ` Body: ${JSON.stringify(body).substring(0, 100)}...` : "")
  );

  const response = await fetch(url, {
    method: method,
    headers: headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  console.log(
    `Printful API Response: ${response.status} ${response.statusText}`
  );
  return response;
}

// --- PostHog Helper (for Queue Consumer) ---
async function sendPostHogEvent(
  env: Env,
  ctx: ExecutionContext, // Queue handler provides standard ExecutionContext
  distinctId: string,
  eventName: string,
  properties?: Record<string, any>
) {
  if (!env.POSTHOG_API_KEY) {
    return;
  }
  const posthogHost = env.POSTHOG_HOST_URL || "https://app.posthog.com";

  const payload = {
    api_key: env.POSTHOG_API_KEY,
    event: eventName,
    distinct_id: distinctId,
    properties: {
      $host: posthogHost,
      worker: "queue-consumer", // Identify source worker
      ...(properties || {}),
    },
    timestamp: new Date().toISOString(),
  };

  const request = new Request(`${posthogHost}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // Use waitUntil from the ExecutionContext passed to the queue handler
  ctx.waitUntil(
    fetch(request).catch((err) =>
      console.error("Error sending PostHog event:", err)
    )
  );
}

export default {
  async queue(
    batch: MessageBatch<TokenFulfillmentMessage | OrderFulfillmentMessage>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    for (const message of batch.messages) {
      const messageId = message.id;
      const queueName = batch.queue;
      console.log(`Received message ${messageId} on queue ${queueName}`);

      let sentry: Toucan | undefined;
      if (env.SENTRY_DSN) {
        try {
          sentry = new Toucan({
            dsn: env.SENTRY_DSN,
            context: ctx,
            initialScope: {
              tags: {
                worker: "queue-consumer",
                queueName: queueName,
              },
              extra: {
                messageId: messageId,
                messageAttempts: message.attempts,
              },
            },
          });
        } catch (e) {
          console.error(
            "Failed to initialize Toucan/Sentry in queue handler",
            e
          );
        }
      }

      try {
        let success = false;
        if (queueName.startsWith("token-fulfillment")) {
          success = await handleTokenFulfillment(
            message as Message<TokenFulfillmentMessage>,
            env,
            ctx,
            sentry
          );
        } else if (queueName.startsWith("order-fulfillment")) {
          success = await handleOrderFulfillment(
            message as Message<OrderFulfillmentMessage>,
            env,
            ctx,
            sentry
          );
        } else {
          console.error(`Unknown queue: ${queueName}`);
          sentry?.captureMessage(
            `Processed message from unknown queue: ${queueName}`,
            "warning"
          );
          message.ack();
          continue;
        }

        if (success) {
          message.ack();
          console.log(
            `Successfully processed and acknowledged message: ${messageId}`
          );
        } else {
          // Explicit failure from handler, retry if possible
          throw new Error(
            `Handler function reported failure for message ${messageId}`
          );
        }
      } catch (error: any) {
        console.error(`Error processing message ${messageId}:`, error);

        if (sentry) {
          sentry.setExtra("finalProcessingError", error.message);
          sentry.captureException(error);
          console.log(`Reported error for message ${messageId} to Sentry.`);
        } else {
          console.log("Sentry not initialized, skipping report.");
        }

        // Retry logic based on attempts
        if (message.attempts < 3) {
          // Check against max_retries (defined in wrangler.toml)
          console.log(
            `Retrying message ${messageId}, attempt ${message.attempts + 1}`
          );
          // Exponential backoff delay
          const delaySeconds = Math.pow(2, message.attempts) * 5;
          message.retry({ delaySeconds: delaySeconds });
        } else {
          console.error(
            `Message ${messageId} failed after ${message.attempts} attempts.`
          );
          // TODO: Send to Dead Letter Queue if configured in wrangler.toml
          // For now, just acknowledge to remove it from the queue and prevent infinite loops
          message.ack();
          // TODO: Trigger alert for manual investigation
        }
      }
    }
  },
};

/**
 * Handles granting tokens after a successful purchase.
 * Returns true on success, false on explicit failure (triggering retry/DLQ).
 */
async function handleTokenFulfillment(
  message: Message<TokenFulfillmentMessage>,
  env: Env,
  ctx: ExecutionContext,
  sentry?: Toucan
): Promise<boolean> {
  const { grant_id, bundle_id, email, stripe_customer_id } = message.body;
  console.log(`Processing token fulfillment for grant_id: ${grant_id}`);

  const tokensToAdd = getTokenAmount(bundle_id);
  if (tokensToAdd === null) {
    console.error(
      `Invalid bundle_id '${bundle_id}' for grant_id ${grant_id}. Cannot process.`
    );
    return true; // Acknowledge - unretryable error
  }

  sentry?.setTag("handler", "handleTokenFulfillment");
  sentry?.setExtra("grant_id", grant_id);

  try {
    // --- Update KV ---
    // Get existing data if any
    const existingData = await env.STATE_KV.get<TokenData>(grant_id, {
      type: "json",
    });
    const currentTokens = existingData?.tokens_remaining ?? 0;
    const newTotalTokens = currentTokens + tokensToAdd;

    const newData: TokenData = {
      ...(existingData || {}), // Preserve any other existing data
      tokens_remaining: newTotalTokens,
      email: email, // Update email just in case
      stripe_customer_id: stripe_customer_id, // Update customer ID
      last_updated: new Date().toISOString(),
      last_bundle_purchased: bundle_id,
    };

    await env.STATE_KV.put(grant_id, JSON.stringify(newData));
    console.log(
      `KV updated for grant_id ${grant_id}: ${newTotalTokens} tokens remaining.`
    );

    // --- Send PostHog Event ---
    sendPostHogEvent(env, ctx, grant_id, "token_purchase_completed", {
      bundle_id: bundle_id,
      email: email, // Consider hashing?
      stripe_customer_id: stripe_customer_id,
      tokens_added: tokensToAdd,
      new_token_balance: newData.tokens_remaining,
    });
    // --- End PostHog Event ---

    // --- Send Confirmation Email ---
    if (!env.RESEND_API_KEY) {
      console.error(
        `RESEND_API_KEY not set. Cannot send confirmation email for grant_id ${grant_id}.`
      );
      sentry?.captureMessage(
        "RESEND_API_KEY missing during token fulfillment",
        "error"
      );
      return true; // Acknowledge - unretryable config error, but KV updated
    }

    const resend = new Resend(env.RESEND_API_KEY);

    try {
      await resend.emails.send({
        from: "DruckMeinShirt <noreply@yourdomain.com>", // REPLACE with your verified Resend domain
        to: [email],
        subject: "Your DruckMeinShirt Token Purchase Confirmation",
        html: `<h2>Thank you for your purchase!</h2>
               <p>Your image generation token balance has been updated.</p>
               <p>Tokens added: ${tokensToAdd}</p>
               <p>Your new balance: ${newTotalTokens}</p>
               <p><strong>Important:</strong> Your access Grant ID is: <code>${grant_id}</code></p>
               <p>Keep this ID safe! You'll need it if you clear your browser data or use a different device. You can use the recovery option on the website if you lose it.</p>
               <p>Happy designing!</p>`,
        // Add tags for tracking if needed
        // tags: [{ name: 'purchase_type', value: 'tokens' }, { name: 'bundle_id', value: bundle_id }]
      });
      console.log(
        `Confirmation email sent to ${email} for grant_id ${grant_id}.`
      );
    } catch (emailError: any) {
      console.error(
        `Failed to send confirmation email for grant_id ${grant_id}:`,
        emailError
      );
      sentry?.captureException(emailError, {
        extra: { context: "Resend email failure during token fulfillment" },
      });
      // Decide if email failure should cause retry. Usually not, as tokens were granted.
      // Log critically and monitor.
      return true; // Acknowledge despite email failure
    }

    return true; // Success
  } catch (kvError) {
    console.error(
      `KV storage error during token fulfillment for grant_id ${grant_id}:`,
      kvError
    );
    return false; // Explicit failure - trigger retry
  }
}

/**
 * Processes messages from the order fulfillment queue.
 * Retrieves order details from KV, submits the order to Printful via their API,
 * sends a confirmation email, and cleans up the temporary KV record.
 *
 * Handles KV errors, Printful API errors (with basic retry logic for 5xx),
 * and email sending errors.
 *
 * Reports critical errors or step failures to Sentry and PostHog.
 *
 * @param {Message<OrderFulfillmentMessage>} message - The queue message containing payment_intent_id and email.
 * @param {Env} env - The worker environment object with bindings and secrets.
 * @param {ExecutionContext} ctx - The execution context for waitUntil operations (PostHog).
 * @param {Toucan} [sentry] - Optional initialized Sentry/Toucan instance for error reporting.
 * @returns {Promise<boolean>} Returns `true` if the message should be acknowledged (success or unretryable error),
 *                             or `false` if the message should be retried (retryable error).
 */
async function handleOrderFulfillment(
  message: Message<OrderFulfillmentMessage>,
  env: Env,
  ctx: ExecutionContext,
  sentry?: Toucan
): Promise<boolean> {
  const { payment_intent_id, email } = message.body;
  const kvOrderKey = `order:${payment_intent_id}`;
  console.log(
    `Processing order fulfillment for PaymentIntent: ${payment_intent_id}`
  );

  // Add context for Sentry reporting
  sentry?.setTag("handler", "handleOrderFulfillment");
  sentry?.setExtra("payment_intent_id", payment_intent_id);

  // --- Pre-checks ---
  if (!env.PRINTFUL_API_KEY || !env.STATE_KV) {
    const errorMsg =
      "Missing PRINTFUL_API_KEY or STATE_KV binding. Cannot process order fulfillment.";
    console.error(errorMsg);
    sentry?.captureMessage(errorMsg, "fatal");
    // Unrecoverable configuration error, do not retry.
    return true;
  }

  // --- Retrieve Order Details ---
  let orderDetails: TShirtOrderDetails | null = null;
  try {
    orderDetails = await env.STATE_KV.get<TShirtOrderDetails>(kvOrderKey, {
      type: "json",
    });
    if (!orderDetails) {
      // Order details missing - maybe TTL expired or never stored properly.
      // This is unrecoverable for this message.
      const errorMsg = `Order details not found in KV for key: ${kvOrderKey}. Maybe expired or never stored?`;
      console.error(errorMsg);
      sentry?.captureMessage(errorMsg, "error");
      sendPostHogEvent(env, ctx, email, "printful_order_failed", {
        reason: "Order details not found in KV",
        payment_intent_id: payment_intent_id,
      });
      return true; // Acknowledge message.
    }
    console.log(`Retrieved order details from KV for PI: ${payment_intent_id}`);
  } catch (kvError: any) {
    // If KV read fails, it might be transient. Request retry.
    console.error(
      `KV error retrieving order details for key ${kvOrderKey}:`,
      kvError
    );
    // Note: Sentry will report this via the main catch block if false is returned.
    return false; // Request retry.
  }

  // --- Process Order with Printful ---
  let printfulOrderId: number | null = null;
  let printfulApiFailed = false;
  let failureReason = "Unknown Printful API failure";
  let isRetryableFailure = false;

  try {
    // Step 1: Create Draft Order in Printful
    console.log("Creating Printful draft order...");
    const createOrderPayload = {
      recipient: orderDetails.shipping_address,
      external_id: payment_intent_id, // Link to our payment intent
    };
    const createResponse = await printfulRequest(
      env.PRINTFUL_API_KEY,
      "POST",
      "/orders",
      createOrderPayload
    );

    if (!createResponse.ok) {
      const errorBody = await createResponse.text();
      failureReason = `Printful Create Order API Error: ${createResponse.status}`;
      console.error(failureReason, errorBody);
      sentry?.captureException(new Error(failureReason), {
        extra: { errorBody, payment_intent_id },
      }); // Report specific error
      printfulApiFailed = true;
      isRetryableFailure = createResponse.status >= 500;
      return !isRetryableFailure; // Ack if 4xx, retry if 5xx
    }
    const createResult = (await createResponse.json()) as { id: number };
    printfulOrderId = createResult.id;
    console.log(
      `Created Printful draft order ${printfulOrderId} for PI ${payment_intent_id}`
    );

    // Step 2: Add Items to Printful Order
    console.log("Adding items to Printful order...");
    for (const item of orderDetails.items) {
      const addItemPayload = {
        source: "catalog",
        catalog_variant_id: item.catalog_variant_id,
        quantity: item.quantity,
        placements: [
          {
            placement: "front", // Assuming front placement based on mockup reqs
            files: [{ url: item.design_url }],
          },
        ],
      };
      const itemResponse = await printfulRequest(
        env.PRINTFUL_API_KEY,
        "POST",
        `/orders/${printfulOrderId}/order-items`,
        addItemPayload
      );
      if (!itemResponse.ok) {
        const errorBody = await itemResponse.text();
        failureReason = `Printful Add Item API Error: ${itemResponse.status} for variant ${item.catalog_variant_id}`;
        console.error(failureReason, errorBody);
        const itemError = new Error(failureReason);
        sentry?.captureException(itemError, {
          extra: {
            errorBody,
            payment_intent_id,
            printfulOrderId,
            catalog_variant_id: item.catalog_variant_id,
          },
        });
        printfulApiFailed = true;
        // Treat item addition failure as unretryable for the whole order for simplicity
        // Could potentially try to remove order draft, but complex.
        throw itemError; // Throw to exit and trigger finally block + ack
      }
      console.log(
        `Added item ${item.catalog_variant_id} (qty ${item.quantity}) to Printful order ${printfulOrderId}`
      );
    }

    // Step 3: Confirm Printful Order
    console.log("Confirming Printful order...");
    const confirmResponse = await printfulRequest(
      env.PRINTFUL_API_KEY,
      "POST",
      `/orders/${printfulOrderId}/confirm`
    );
    if (!confirmResponse.ok) {
      const errorBody = await confirmResponse.text();
      failureReason = `Printful Confirm Order API Error: ${confirmResponse.status}`;
      console.error(failureReason, errorBody);
      sentry?.captureException(new Error(failureReason), {
        extra: { errorBody, payment_intent_id, printfulOrderId },
      }); // Report specific error
      printfulApiFailed = true;
      isRetryableFailure = confirmResponse.status >= 500;
      return !isRetryableFailure; // Ack if 4xx, retry if 5xx
    }
    console.log(`Confirmed Printful order ${printfulOrderId}`);

    // --- Order Successfully Submitted ---
    console.log(`Printful order ${printfulOrderId} submission successful.`);

    // Send PostHog event for successful order completion
    sendPostHogEvent(env, ctx, email, "tshirt_order_completed", {
      payment_intent_id: payment_intent_id,
      printful_order_id: printfulOrderId,
      email: email, // Consider hashing
      shipping_country: orderDetails.shipping_address.country_code,
      total_amount_eur: (orderDetails.total_amount_cents / 100).toFixed(2),
    });

    // Send confirmation email via Resend
    if (env.RESEND_API_KEY) {
      try {
        console.log("Sending order confirmation email...");
        const resend = new Resend(env.RESEND_API_KEY);
        await resend.emails.send({
          from: "DruckMeinShirt <noreply@yourdomain.com>", // REPLACE with your verified Resend domain
          to: [email],
          subject: "Your DruckMeinShirt Order Confirmation",
          html: `<h2>Thank you for your order!</h2>
                 <p>Your T-shirt order has been successfully submitted for printing and fulfillment.</p>
                 <p>Printful Order ID: ${printfulOrderId}</p>
                 <p>We'll notify you again once it ships (if Printful webhooks are configured).</p>
                 <p>Thank you for shopping with DruckMeinShirt!</p>`,
          // Add tags for tracking if needed
          // tags: [{ name: 'purchase_type', value: 'tshirt' }]
        });
        console.log(
          `Order confirmation email sent to ${email} for Printful order ${printfulOrderId}`
        );
      } catch (emailError: any) {
        // Log email error and report to Sentry, but don't fail the overall process
        console.error(
          `Failed to send order confirmation email for PI ${payment_intent_id}, Printful Order ${printfulOrderId}:`,
          emailError
        );
        sentry?.captureException(emailError, {
          extra: {
            context: "Resend email failure during order fulfillment",
            payment_intent_id,
            printfulOrderId,
            email,
          },
        });
      }
    } else {
      console.warn(
        "RESEND_API_KEY not set. Skipping order confirmation email."
      );
      sentry?.captureMessage(
        "RESEND_API_KEY missing during order confirmation",
        "warning"
      );
    }

    // Delete temporary order details from KV *after* successful submission & notifications
    try {
      console.log(`Deleting KV data for key: ${kvOrderKey}`);
      await env.STATE_KV.delete(kvOrderKey);
      console.log(`Deleted order details from KV for key: ${kvOrderKey}`);
    } catch (kvDeleteError: any) {
      // Log KV delete error and report to Sentry, but the order succeeded, so ack message.
      console.error(
        `KV delete error for key ${kvOrderKey} after successful order ${printfulOrderId}:`,
        kvDeleteError
      );
      sentry?.captureException(kvDeleteError, {
        extra: {
          context: "KV delete failure post-order fulfillment",
          payment_intent_id,
          printfulOrderId,
          kvOrderKey,
        },
      });
    }

    return true; // Order processing successful, acknowledge message.
  } catch (error: any) {
    // Catch errors primarily from the Add Item loop or unexpected issues
    console.error(
      `Error during Printful order processing for PI ${payment_intent_id} (Current Printful ID: ${printfulOrderId ?? "N/A"}):`,
      error
    );
    // Ensure failure flags are set if not already
    printfulApiFailed = true;
    failureReason = error.message || "Error processing Printful items";
    isRetryableFailure = false; // Assume errors caught here are not retryable
    // Note: Sentry will report this via the main catch block.
    return true; // Acknowledge message to prevent loops.
  } finally {
    // If any step failed in a way determined to be unretryable, send PostHog failure event.
    if (printfulApiFailed && !isRetryableFailure) {
      console.log(
        "Sending PostHog failure event for unretryable Printful error."
      );
      sendPostHogEvent(env, ctx, email, "printful_order_failed", {
        reason: failureReason,
        payment_intent_id: payment_intent_id,
        printful_order_id: printfulOrderId,
      });
    }
  }
}
