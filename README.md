# DruckMeinShirt

A streamlined, serverless web application for the German market enabling users to design T-shirts using their own images or AI-generated images (via x.ai Grok API), visualize them on mockups, purchase image generation credits, and order the final printed T-shirts via Printful.

## Core Features

- Image Upload (PNG/JPEG)
- AI Image Generation (x.ai Grok API)
- Token System for AI Credits (Stripe for purchase)
- T-shirt Mockup & Customization (Color, Placement)
- Direct T-shirt Ordering (Printful v2 Beta API)
- Payment Processing (Stripe)
- "No User Account" model using `grant_id` for tokens.
- Analytics via PostHog

## Tech Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript (using Vite for dev/build)
- **Backend:** Cloudflare Workers (TypeScript)
  - API Gateway: Hono framework
  - Queue Consumer: Handles async tasks
- **Infrastructure:**
  - Cloudflare Pages (Frontend Hosting)
  - Cloudflare Workers (Backend Logic)
  - Cloudflare KV (State Storage)
  - Cloudflare R2 (Image Storage)
  - Cloudflare Queues (Background Job Processing)
- **External APIs:**
  - Stripe (Payments)
  - Printful (v2 Beta - Fulfillment)
  - Resend (Transactional Emails)
  - x.ai (Image Generation)
  - PostHog (Analytics)
- **CI/CD:** GitHub Actions

## Setup

Please refer to the `SETUP_INSTRUCTIONS.md` file for detailed steps on configuring Cloudflare resources, external services, and GitHub secrets.

## Local Development

1.  **Install Dependencies:**
    ```bash
    npm install --prefix frontend
    npm install --prefix workers/api-gateway
    npm install --prefix workers/queue-consumer
    ```
2.  **Configure Local Secrets:**
    - Copy `frontend/.env.example` to `frontend/.env` and fill in values.
    - Create/fill `workers/api-gateway/.dev.vars`.
    - Create/fill `workers/queue-consumer/.dev.vars`.
    - Use `stripe listen --forward-to http://localhost:8787/api/stripe/webhook` to get a local webhook secret and update `.dev.vars`.
3.  **Run Services (in separate terminals):**
    - `stripe listen --forward-to http://localhost:8787/api/stripe/webhook`
    - `npm run start --prefix workers/api-gateway` (or `wrangler dev`)
    - `npm run start --prefix workers/queue-consumer` (or `wrangler dev --local`)
    - `npm run dev --prefix frontend`
4.  Access frontend at `http://localhost:3000` (or port specified by Vite).

## Deployment

- Deployments are handled automatically via GitHub Actions.
- Pushing to the `develop` branch deploys to the **Staging** environment.
- Pushing to the `main` branch deploys to the **Production** environment.

## Contributing

(Add contribution guidelines if applicable)

## License

(Specify license if applicable)
