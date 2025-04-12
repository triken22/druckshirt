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
  // Add other relevant fields if needed
}

interface OrderFulfillmentMessage {
  payment_intent_id: string;
  email: string;
  // Add other relevant fields if needed, like Stripe Customer ID
}

export default {
  async queue(
    batch: MessageBatch<TokenFulfillmentMessage | OrderFulfillmentMessage>,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    for (const message of batch.messages) {
      console.log(`Received message on queue ${batch.queue}: ${message.id}`);

      try {
        if (
          batch.queue === "token-fulfillment-queue-staging" ||
          batch.queue === "token-fulfillment-queue-production"
        ) {
          await handleTokenFulfillment(
            message as Message<TokenFulfillmentMessage>,
            env
          );
        } else if (
          batch.queue === "order-fulfillment-queue-staging" ||
          batch.queue === "order-fulfillment-queue-production"
        ) {
          await handleOrderFulfillment(
            message as Message<OrderFulfillmentMessage>,
            env
          );
        } else {
          console.error(`Unknown queue: ${batch.queue}`);
          message.retry({ delaySeconds: 60 }); // Example: retry after a delay
        }

        message.ack();
        console.log(`Acknowledged message: ${message.id}`);
      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);

        if (message.attempts < 3) {
          // Check against max_retries-1 essentially
          console.log(
            `Retrying message ${message.id}, attempt ${message.attempts + 1}`
          );
          message.retry({ delaySeconds: Math.pow(2, message.attempts) * 5 }); // Exponential backoff example
        } else {
          console.error(`Message ${message.id} failed after max retries.`);
          message.ack(); // Acking prevents infinite loops if no DLQ
          // TODO: Trigger alert for manual intervention
        }
      }
    }
  },
};

async function handleTokenFulfillment(
  message: Message<TokenFulfillmentMessage>,
  env: Env
): Promise<void> {
  console.log(
    `Processing token fulfillment for grant_id: ${message.body.grant_id}`
  );
  // TODO: Implement logic from instruct.txt
  await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate async work
  console.log(
    `Finished token fulfillment for grant_id: ${message.body.grant_id}`
  );
}

async function handleOrderFulfillment(
  message: Message<OrderFulfillmentMessage>,
  env: Env
): Promise<void> {
  console.log(
    `Processing order fulfillment for PaymentIntent: ${message.body.payment_intent_id}`
  );
  // TODO: Implement logic from instruct.txt
  await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate async work
  console.log(
    `Finished order fulfillment for PaymentIntent: ${message.body.payment_intent_id}`
  );
}
