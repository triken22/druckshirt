# Infrastructure Setup Instructions

This guide outlines the steps needed to configure Cloudflare resources and GitHub secrets to run and deploy the DruckMeinShirt application.

## I. Cloudflare Setup

You need a Cloudflare account. Most resources can be created via the Cloudflare dashboard or using the Wrangler CLI.

**1. KV Namespaces (Key-Value Store):**

- Create **two** KV namespaces: one for production (`druckmeinshirt-state-production`) and one for staging (`druckmeinshirt-state-staging`).
- **Action:** Note down the **ID** for each namespace.
- **Update:** Replace `<REPLACE_WITH_..._KV_ID>` placeholders in `workers/api-gateway/wrangler.toml` and `workers/queue-consumer/wrangler.toml` with the corresponding IDs.

**2. R2 Buckets (Object Storage):**

- Create **two** R2 buckets: `druckmeinshirt-images-production` and `druckmeinshirt-images-staging`.
- **Action:** Ensure public access is configured appropriately for your needs (e.g., allow public reads if Printful needs direct access via URL, but restrict listing). Configure CORS rules if accessing directly from the frontend.

* Example CORS Rule (adjust origins):
  ```json
  [
    {
      "AllowedOrigins": [
        "https://investorio.ai",
        "https://investorio-staging.pages.dev",
        "http://localhost:3000"
      ],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
  ```

- **Update:** Replace `<REPLACE_WITH_..._R2_BUCKET_NAME>` placeholders in `workers/api-gateway/wrangler.toml` with the bucket names.

**3. Queues:**

- Create **four** Queues:
  - `token-fulfillment-queue-production`
  - `order-fulfillment-queue-production`
  - `token-fulfillment-queue-staging`
  - `order-fulfillment-queue-staging`
- **Action:** No IDs needed for `wrangler.toml`, but ensure the names match exactly those specified in the `[[queues.producers]]` and `[[queues.consumers]]` sections of the `wrangler.toml` files. The consumer worker will automatically bind to queues with matching names defined under `[[queues.consumers]]`.

**4. Cloudflare Pages Project:**

- Connect your GitHub repository to Cloudflare Pages.
- Configure the build settings:
  - **Framework preset:** `Vite` (or None if not using a build step)
  - **Build command:** `npm run build` (if applicable)
  - **Build output directory:** `frontend/dist` (adjust if needed)
  - **Root directory:** `frontend`
- Set up environment variables for **Production** and **Preview/Staging** (these are separate from Worker secrets):
  - `VITE_POSTHOG_KEY` (Use Production Key for Production, Staging key for Staging/Preview)
  - `VITE_POSTHOG_HOST`
  - `NODE_VERSION`: `20` (or your chosen version)
- **Action:** Note down the **Project Name** assigned by Cloudflare Pages.
- **Update:** Replace `<REPLACE_WITH_CLOUDFLARE_PAGES_PROJECT_NAME>` in `.github/workflows/deploy-frontend.yml`.

**5. Cloudflare API Token:**

- Create an API Token with permissions to edit Workers, KV, R2, and Pages. Use the "Edit Cloudflare Workers" template as a starting point and add necessary permissions.
- **Action:** Copy the generated API token securely.

## II. External Service Setup

**1. Stripe:**

- Obtain your **Test** and **Live** Secret Keys.
- Set up a webhook endpoint in Stripe Dashboard (for Test and Live modes) pointing to your deployed API Gateway Worker URL (`https://<worker-domain>/api/stripe/webhook`).
- Select the `payment_intent.succeeded` event.
- Obtain the **Webhook Signing Secret** for Test and Live modes. For local development, use `stripe listen --forward-to localhost:8787/api/stripe/webhook` (adjust port if needed) to get a temporary local signing secret.

**2. Printful:**

- Obtain your Printful API Key (Private Token). Check if they offer separate Test/Sandbox keys or environments.

**3. Resend:**

- Obtain your Resend API Key. Configure sending domains.

**4. x.ai:**

- Obtain your x.ai API Key.

**5. PostHog:**

- Obtain your Project API Key (for Staging and Production if using separate projects).
- Note your instance host address (Cloud or self-hosted).

## III. GitHub Setup

**1. Repository Secrets:**

- Go to your GitHub repository -> Settings -> Secrets and Variables -> Actions.
- Create secrets for **both** your `staging` and `production` environments (configure environments under Settings -> Environments first).
- **Required Secrets:**
  - `CLOUDFLARE_API_TOKEN`: The Cloudflare API token created earlier.
  - `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare Account ID (fdef5e2aa7e29e39b787156d6d92f902).
  - `STRIPE_SECRET_KEY`: (Staging and Production versions)
  - `STRIPE_WEBHOOK_SECRET`: (Staging and Production versions)
  - `PRINTFUL_API_KEY`: (Staging and Production versions, use same if no sandbox)
  - `RESEND_API_KEY`: (Staging and Production versions)
  - `XAI_API_KEY`: (Staging and Production versions)
  - `POSTHOG_API_KEY`: (Optional: If needed for server-side tracking)
  - `NPM_TOKEN`: (Optional: Only if you use private NPM packages)

## IV. Local Development Setup

**1. Install Dependencies:**

```bash
npm install --prefix frontend
npm install --prefix workers/api-gateway
npm install --prefix workers/queue-consumer
```

**2. Configure Local Secrets:**

- Copy `frontend/.env.example` to `frontend/.env` and fill in values (e.g., Staging PostHog key).
- Create `workers/api-gateway/.dev.vars` and `workers/queue-consumer/.dev.vars` (using the files created earlier as templates) and fill in your **TEST** API keys. For `STRIPE_WEBHOOK_SECRET`, use the one provided by `stripe listen`.

**3. Run Locally:**

- **Start Stripe Listener (separate terminal):**
  ```bash
  stripe listen --forward-to http://localhost:8787/api/stripe/webhook
  ```
  (Copy the `whsec_...` it provides into `workers/api-gateway/.dev.vars`)
- **Start Workers (separate terminal):**

  ```bash
  # In workers/api-gateway directory
  npm run start # or wrangler dev

  # In workers/queue-consumer directory
  npm run start # or wrangler dev --local
  ```

- **Start Frontend (separate terminal):**
  ```bash
  # In frontend directory
  npm run dev
  ```
- Access the frontend at `http://localhost:3000` (or the port Vite assigns).

## V. Final Checks

- Ensure `.env` and `.dev.vars` files are listed in your `.gitignore`.
- Review the `TODO` comments in the source code files.
- Manually correct the YAML errors in `.github/workflows/ci-checks.yml` and implement the test/lint steps.
