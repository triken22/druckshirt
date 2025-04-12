/// <reference types="@cloudflare/workers-types" />

import { Resend } from "resend";

// Define types for bindings and secrets
export interface Env {
  STATE_KV: KVNamespace;

  // Secrets (Injected via wrangler secrets or GitHub Actions)
  STRIPE_SECRET_KEY: string; // Needed if interacting with Stripe API here
  PRINTFUL_API_KEY: string;
  RESEND_API_KEY: string;
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

const getTokenAmount = (bundleId: string): number | null => {
  // Define token amounts per bundle
  const amounts: { [key: string]: number } = {
    tokens_10: 10,
    tokens_50: 50,
    // Must match prices defined in api-gateway
  };
  return amounts[bundleId] || null;
};

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

      try {
        let success = false;
        if (queueName.startsWith("token-fulfillment")) {
          success = await handleTokenFulfillment(
            message as Message<TokenFulfillmentMessage>,
            env
          );
        } else if (queueName.startsWith("order-fulfillment")) {
          success = await handleOrderFulfillment(
            message as Message<OrderFulfillmentMessage>,
            env
          );
        } else {
          console.error(`Unknown queue: ${queueName}`);
          // Don't retry unknown queues, move to DLQ or ACK immediately
          message.ack();
          continue; // Skip to next message
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
        // TODO: Integrate proper error reporting (e.g., Sentry)

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
  env: Env
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

    // --- Send Confirmation Email ---
    if (!env.RESEND_API_KEY) {
      console.error(
        `RESEND_API_KEY not set. Cannot send confirmation email for grant_id ${grant_id}.`
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
 * Handles T-shirt order fulfillment after successful payment.
 * Returns true on success, false on explicit failure (triggering retry/DLQ).
 */
async function handleOrderFulfillment(
  message: Message<OrderFulfillmentMessage>,
  env: Env
): Promise<boolean> {
  const { payment_intent_id, email } = message.body;
  console.log(
    `Processing order fulfillment for PaymentIntent: ${payment_intent_id}`
  );

  // TODO: Implement T-shirt order fulfillment logic (Phase 2+)
  // 1. Retrieve full order details from STATE_KV using payment_intent_id
  // 2. If details found:
  //    a. Submit order to Printful API using PRINTFUL_API_KEY
  //    b. Send confirmation email via Resend using RESEND_API_KEY and email
  //    c. Delete order details from STATE_KV
  // 3. If details not found: Log error, potentially send failure email.
  // 4. Return false if any step fails and is retryable (e.g., Printful API temp error)
  // 5. Return true if successful OR if failure is unretryable (e.g., order details missing)

  console.warn("T-shirt order fulfillment not implemented yet.");
  await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate async work
  return true; // Acknowledge for now
}
