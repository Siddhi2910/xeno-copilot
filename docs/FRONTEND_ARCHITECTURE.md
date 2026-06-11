● Xeno Copilot CRM — Frontend Architecture Blueprint

  ---
  0. Pre-Design Audit: What the Backend Actually Supports

  Before any design decision was made, every backend file was read and catalogued. The following is a precise inventory of available capabilities —
  the frontend is designed exclusively around these.

  Available API Surface:

  ┌───────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │ Resource  │                                                            Operations                                                            │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Health    │ GET status                                                                                                                       │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Customers │ List (filter: rfmSegment, tag, channel, search, cursor pagination), Get one, Get communications timeline, PATCH opt-out          │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Orders    │ List (filter: customerId, channel, startDate, endDate, cursor pagination), Get one                                               │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Segments  │ List aggregates (count, avgSpend, avgOrderFrequency, avgDaysSinceLastOrder, percentOfTotal), List customers in segment           │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Campaigns │ Preview audience, Create DRAFT, List (filter by status, cursor pagination), Get detail, Get stats, Get messages (cursor          │
  │           │ pagination), DRAFT→READY, READY→LAUNCH                                                                                           │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ AI        │ Extract intent (Call 1), Audience preview no-save (Calls 2+3), Generate + save campaign (Calls 2+3), Refine messages (Call 4)    │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Import    │ Upload CSV (customers or orders), Get job status, List jobs                                                                      │
  └───────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  Data Models Fully Understood:
  - 6 RFM segments: CHAMPIONS, PROMISING, AT_RISK_LOYALISTS, DORMANT_VIPS, LAPSED_LOW_VALUE, GENERAL
  - 6 campaign statuses: DRAFT → READY_FOR_REVIEW → LAUNCHING → ACTIVE → COMPLETED / FAILED
  - 3 channels: WHATSAPP, EMAIL, SMS
  - 7 event types: SENT, DELIVERED, OPENED, CLICKED, CONVERTED, FAILED, OPT_OUT
  - 5 intent types: WIN_BACK_DORMANT, REWARD_TOP_SPENDERS, RE_ENGAGE_SINGLE_PURCHASE, UPSELL_CATEGORY, VIP_LOYALTY
  - Pagination model: cursor-encoded base64 ObjectId, { data, pagination: { hasMore, nextCursor } }
  - Error envelope: { error: { code, message, field? } }

  Known Backend Constraints the Frontend Must Respect:
  - No total-count field on paginated endpoints — approximate counts only on dashboard
  - No PATCH endpoint for campaigns — name/goal cannot be edited after creation
  - hmacSecret is stripped from all campaign API responses — frontend never sees it
  - /callbacks/delivery is internal — never called from browser
  - Bearer token must be kept server-side — never exposed to browser

  ---
  1. High-Level Architecture

  ┌─────────────────────────────────────────────────────────────────┐
  │                         Browser                                  │
  │  ┌─────────────────────────────────────────────────────────┐   │
  │  │              Next.js 14 App (Vercel)                      │   │
  │  │                                                           │   │
  │  │  React Server Components (layouts, initial shell)         │   │
  │  │  React Client Components (interactive UI, charts, forms)  │   │
  │  │  TanStack Query (all server state, caching, mutations)    │   │
  │  │  Zustand (wizard state, UI preferences)                   │   │
  │  │                                                           │   │
  │  │  ┌──────────────────────────────────────────────────┐   │   │
  │  │  │     /api/proxy/[...path]  (BFF Proxy Route)      │   │   │
  │  │  │  - Validates iron-session cookie                  │   │   │
  │  │  │  - Injects Authorization: Bearer <CRM_API_SECRET> │   │   │
  │  │  │  - Forwards request to CRM backend                │   │   │
  │  │  │  - Returns response verbatim                      │   │   │
  │  │  └──────────────────────────────────────────────────┘   │   │
  │  └─────────────────────────────────────────────────────────┘   │
  └──────────────────────────┬──────────────────────────────────────┘
                             │ HTTP  (internal network or VPN)
                             ▼
  ┌──────────────────────────────────────┐
  │    Xeno CRM Backend (Express)         │
  │    Port 3001 / Render deployment      │
  │    MongoDB Atlas                      │
  └──────────────────────────────────────┘

  Why BFF Proxy:
  The backend authenticates with API_SECRET_TOKEN — a symmetric shared secret. Exposing this in browser JavaScript is a critical security
  vulnerability. The Next.js API route acts as a Backend-for-Frontend: the token lives exclusively in Vercel environment variables, never shipped to
   the client. Every browser request goes to /api/proxy/* which the server-side route rewrites to the real backend URL.

  Rendering Strategy:
  - Route shell, sidebar, navigation: React Server Components (no interactivity needed, fast paint)
  - Data grids, charts, wizards, forms: React Client Components (require hooks, event handlers)
  - Page-level data fetching: TanStack Query inside client boundaries (not fetch in RSC) — this keeps the caching, refetch, and optimistic update
  logic uniform and avoids RSC/client hydration mismatches

  ---
  2. Technology Stack with Justifications

  ┌─────────────────────┬─────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │     Technology      │   Version   │                                             Justification                                              │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Next.js App Router  │ 14+         │ File-based routing, layouts, React Server Components, built-in API routes for BFF proxy, Vercel-native │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ TypeScript          │ 5+          │ Mirrors backend type safety; catches interface mismatches at compile time                              │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Tailwind CSS        │ 3.4+        │ Utility-first scales better than CSS-in-JS for a design-dense product; purge keeps bundle small        │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ shadcn/ui           │ latest      │ Copy-paste Radix primitives — full customization, zero vendor lock-in, WAI-ARIA compliant, pairs       │
  │                     │             │ perfectly with Tailwind                                                                                │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ TanStack Query v5   │ 5+          │ Best-in-class: deduplication, background refetch, cursor-based infinite queries, optimistic mutations, │
  │                     │             │  devtools                                                                                              │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Zustand             │ 4+          │ Minimal global state for campaign wizard (multi-step, cross-component) and UI preferences; no Redux    │
  │                     │             │ overhead                                                                                               │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ Recharts            │ 2.12+       │ Composable React chart library; native SVG, SSR-safe, TypeScript-first, no Canvas quirks               │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ TanStack Table v8   │ 8+          │ Headless table — full UI control; handles sorting, column visibility, row selection without fighting   │
  │                     │             │ styles                                                                                                 │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ React Hook Form +   │ RHF 7, Zod  │ Mirror backend Zod schemas exactly; RHF avoids re-renders on every keystroke                           │
  │ Zod                 │ 3           │                                                                                                        │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ iron-session        │ 8+          │ Encrypted HTTP-only cookie sessions; no database required; perfect for single-operator internal tools  │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ date-fns            │ 3+          │ Tree-shakeable date utilities; format timestamps, date range arithmetic                                │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ lucide-react        │ latest      │ Consistent icon library; same icons used in shadcn/ui                                                  │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ clsx +              │ latest      │ Safe className concatenation without Tailwind specificity conflicts                                    │
  │ tailwind-merge      │             │                                                                                                        │
  ├─────────────────────┼─────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ TanStack Virtual    │ 3+          │ Windowed rendering for campaign messages and customer communications lists (potentially thousands of   │
  │                     │             │ rows)                                                                                                  │
  └─────────────────────┴─────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  3. Folder Structure

  xeno-copilot-web/
  ├── .env.local                          # CRM_API_URL, CRM_API_SECRET, SESSION_SECRET, ADMIN_PASSWORD
  ├── .env.example                        # Documented env template
  ├── next.config.ts                      # rewrites, headers, image domains
  ├── tailwind.config.ts                  # design tokens, custom colors
  ├── tsconfig.json
  ├── components.json                     # shadcn/ui registry config
  │
  ├── public/
  │   └── logo.svg
  │
  └── src/
      ├── app/
      │   ├── globals.css                 # Tailwind base, CSS variables for design tokens
      │   ├── layout.tsx                  # RootLayout: html, body, Providers wrapper
      │   │
      │   ├── (auth)/                     # Auth route group — no sidebar, no topbar
      │   │   └── login/
      │   │       └── page.tsx
      │   │
      │   ├── (dashboard)/                # Protected route group
      │   │   ├── layout.tsx              # DashboardLayout: auth guard + Sidebar + TopBar
      │   │   ├── page.tsx                # Redirects to /dashboard
      │   │   │
      │   │   ├── dashboard/
      │   │   │   └── page.tsx
      │   │   │
      │   │   ├── campaigns/
      │   │   │   ├── page.tsx            # Campaign list with status tabs
      │   │   │   ├── new/
      │   │   │   │   └── page.tsx        # AI campaign creation wizard
      │   │   │   └── [campaignId]/
      │   │   │       ├── page.tsx        # Campaign detail + funnel + clusters
      │   │   │       └── messages/
      │   │   │           └── page.tsx    # All dispatched messages
      │   │   │
      │   │   ├── customers/
      │   │   │   ├── page.tsx            # Filterable customer list
      │   │   │   └── [customerId]/
      │   │   │       └── page.tsx        # Customer profile + RFM + timeline
      │   │   │
      │   │   ├── orders/
      │   │   │   └── page.tsx            # Orders list with filters
      │   │   │
      │   │   ├── segments/
      │   │   │   ├── page.tsx            # Segment analytics overview
      │   │   │   └── [segmentName]/
      │   │   │       └── page.tsx        # Segment detail + customer list
      │   │   │
      │   │   └── import/
      │   │       ├── page.tsx            # Upload zone + job history
      │   │       └── [jobId]/
      │   │           └── page.tsx        # Import job status + error log
      │   │
      │   └── api/
      │       ├── auth/
      │       │   ├── login/
      │       │   │   └── route.ts        # Validates ADMIN_PASSWORD, sets iron-session cookie
      │       │   └── logout/
      │       │       └── route.ts        # Clears session cookie
      │       └── proxy/
      │           └── [...path]/
      │               └── route.ts        # BFF proxy: validates session, injects Bearer, forwards
      │
      ├── components/
      │   │
      │   ├── ui/                         # shadcn/ui primitives (installed via CLI, owned by project)
      │   │   ├── button.tsx
      │   │   ├── badge.tsx
      │   │   ├── card.tsx
      │   │   ├── dialog.tsx
      │   │   ├── dropdown-menu.tsx
      │   │   ├── input.tsx
      │   │   ├── label.tsx
      │   │   ├── popover.tsx
      │   │   ├── progress.tsx
      │   │   ├── select.tsx
      │   │   ├── separator.tsx
      │   │   ├── skeleton.tsx
      │   │   ├── table.tsx
      │   │   ├── tabs.tsx
      │   │   ├── textarea.tsx
      │   │   ├── toast.tsx
      │   │   └── tooltip.tsx
      │   │
      │   ├── layout/
      │   │   ├── Sidebar.tsx             # Nav links, brand mark, collapse toggle
      │   │   ├── TopBar.tsx              # Global search placeholder, user menu
      │   │   ├── PageHeader.tsx          # Page title + subtitle + action slot
      │   │   └── SectionHeader.tsx       # Section title within a page
      │   │
      │   ├── shared/
      │   │   ├── StatusBadge.tsx         # Color-mapped badge for campaign/message/job status
      │   │   ├── ChannelBadge.tsx        # WHATSAPP / EMAIL / SMS with icon
      │   │   ├── RfmSegmentBadge.tsx     # Color-mapped badge for RFM segment
      │   │   ├── MetricCard.tsx          # KPI card: label + value + optional delta/icon
      │   │   ├── EmptyState.tsx          # Icon + heading + description + optional CTA
      │   │   ├── ErrorState.tsx          # Error boundary fallback + retry button
      │   │   ├── InlineError.tsx         # Inline error below form fields
      │   │   ├── SkeletonTable.tsx       # Table skeleton matching real table column widths
      │   │   ├── SkeletonCards.tsx       # Grid of card skeletons for KPI rows
      │   │   ├── ConfirmDialog.tsx       # Generic confirmation modal with title/body/confirm/cancel
      │   │   ├── CursorPagination.tsx    # Load more button + cursor state
      │   │   └── TimestampCell.tsx       # Date formatted with tooltip showing full ISO string
      │   │
      │   ├── charts/
      │   │   ├── FunnelChart.tsx         # Horizontal funnel: SENT→DELIVERED→OPENED→CLICKED→CONVERTED
      │   │   ├── DonutChart.tsx          # Segment distribution / channel mix
      │   │   ├── SegmentBarChart.tsx     # Horizontal bars: avg spend comparison across segments
      │   │   ├── ChannelMixBar.tsx       # Stacked bar: channel breakdown per campaign or total
      │   │   └── CampaignRatesBar.tsx    # Grouped bar: deliveryRate / openRate / clickRate
      │   │
      │   ├── tables/
      │   │   ├── DataTable.tsx           # TanStack Table base: columns, pagination slot, filter slot
      │   │   └── ColumnVisibilityToggle.tsx  # Dropdown to show/hide columns
      │   │
      │   ├── forms/
      │   │   ├── SearchInput.tsx         # Debounced search (300ms) with clear button
      │   │   ├── FilterBar.tsx           # Composable filter pill row
      │   │   ├── DateRangePicker.tsx     # Popover with two date inputs (startDate/endDate)
      │   │   └── CsvUploadZone.tsx       # Drag-and-drop + file input, type selector (customers/orders)
      │   │
      │   ├── campaigns/
      │   │   ├── CampaignCard.tsx        # List card: name, status badge, channel mix, audience size, CTA
      │   │   ├── CampaignStatusBadge.tsx # Status-specific color + icon
      │   │   ├── CampaignFunnelPanel.tsx # Funnel chart + rate metrics in a panel
      │   │   ├── ClusterCard.tsx         # Channel badge, member count, message preview, personas
      │   │   ├── MessagePreviewCard.tsx  # WhatsApp / Email message with character count
      │   │   ├── RevenueEstimatePanel.tsx # Min-max range display + source attribution
      │   │   ├── CritiqueIssueList.tsx   # Collapsible list of CR-00X issues with severity
      │   │   ├── AiReportPanel.tsx       # Markdown-rendered AI post-campaign report
      │   │   └── wizard/
      │   │       ├── WizardShell.tsx     # Step indicator + navigation + Zustand integration
      │   │       ├── Step1Goal.tsx       # Textarea + intent extract CTA + confirmation display
      │   │       ├── Step2Preview.tsx    # Audience stats + cluster cards + revenue estimate (read-only preview)
      │   │       ├── Step3Generate.tsx   # Name input + generate CTA + loading state + cluster message display
      │   │       ├── Step4Refine.tsx     # Optional feedback textarea + refine CTA + change log display
      │   │       └── Step5Launch.tsx     # Schedule picker + summary + ready + launch CTAs
      │   │
      │   ├── customers/
      │   │   ├── RfmScoreDisplay.tsx     # Three score cells (R/F/M) with colored bars 1-5
      │   │   ├── CommunicationTimeline.tsx # Virtualized timeline of events, channel icons, timestamps
      │   │   └── OptOutToggleRow.tsx     # Per-channel toggle with PATCH mutation
      │   │
      │   └── segments/
      │       ├── SegmentCard.tsx         # Segment name, count, avg spend, CTA to view customers
      │       └── SegmentStatsTable.tsx   # Comparative table: all 6 segments side by side
      │
      ├── lib/
      │   │
      │   ├── api/
      │   │   ├── client.ts               # Base fetch: prefixes /api/proxy, throws ApiError on non-2xx
      │   │   ├── campaigns.ts            # All campaign fetch functions
      │   │   ├── customers.ts            # All customer fetch functions
      │   │   ├── orders.ts               # All order fetch functions
      │   │   ├── segments.ts             # All segment fetch functions
      │   │   ├── importJobs.ts           # All import fetch functions
      │   │   └── ai.ts                   # All AI call functions
      │   │
      │   ├── hooks/
      │   │   ├── useCampaigns.ts         # useQuery wrappers for campaign endpoints
      │   │   ├── useCampaignStats.ts     # Polling hook for ACTIVE campaign stats
      │   │   ├── useCampaignMessages.ts  # useInfiniteQuery for /messages
      │   │   ├── useCustomers.ts         # useInfiniteQuery for customer list
      │   │   ├── useCustomerDetail.ts    # useQuery for customer + communications
      │   │   ├── useOrders.ts            # useInfiniteQuery for orders
      │   │   ├── useSegments.ts          # useQuery for segment aggregates
      │   │   ├── useImportJobs.ts        # useInfiniteQuery + polling for PROCESSING jobs
      │   │   ├── useLaunchCampaign.ts    # useMutation with optimistic update
      │   │   ├── useOptOut.ts            # useMutation + customer detail invalidation
      │   │   └── useAIPipeline.ts        # Sequential mutation manager for 4 AI calls
      │   │
      │   ├── stores/
      │   │   ├── campaignWizardStore.ts  # Zustand: goalText, intentResult, audiencePreview, generatedCampaign, refineResult, step
      │   │   └── uiStore.ts              # Zustand: sidebarCollapsed, theme preference
      │   │
      │   ├── types/
      │   │   ├── api.ts                  # ApiResponse<T>, PaginatedResponse<T>, ApiError
      │   │   ├── campaign.ts             # Campaign, CampaignCluster, CampaignMessage, CampaignStats types
      │   │   ├── customer.ts             # Customer, CommunicationEvent types
      │   │   ├── order.ts                # Order types
      │   │   ├── segment.ts              # SegmentAggregate types
      │   │   ├── importJob.ts            # ImportJob types
      │   │   └── ai.ts                   # IntentResult, AudiencePreview, GeneratedCampaign, CritiqueResult types
      │   │
      │   ├── utils/
      │   │   ├── formatters.ts           # formatCurrency (₹), formatDate, formatPercent, formatNumber
      │   │   ├── colors.ts               # Segment→color map, Status→color map, Channel→color map
      │   │   └── queryKeys.ts            # TanStack Query key factory (see Section 7)
      │   │
      │   └── constants/
      │       ├── segments.ts             # RFM_SEGMENTS array with labels + colors + descriptions
      │       ├── channels.ts             # CHANNELS with icons + colors
      │       └── statuses.ts             # Campaign/message status metadata
      │
      ├── providers/
      │   ├── QueryProvider.tsx           # TanStack Query client + devtools
      │   └── ToastProvider.tsx           # shadcn Toaster
      │
      └── middleware.ts                   # Edge middleware: redirect /dashboard/* to /login if no session

  ---
  4. Routing Structure

  /login                              → Login page (auth group, no layout)
  /                                   → Server redirect → /dashboard

  /dashboard                          → Main overview dashboard

  /campaigns                          → Campaign list (status tab filters: All|Draft|Active|Completed|Failed)
  /campaigns/new                      → AI wizard (5 steps, wizard shell)
  /campaigns/[campaignId]             → Campaign detail (funnel, clusters, AI report)
  /campaigns/[campaignId]/messages    → All dispatched messages for campaign

  /customers                          → Customer list (search + segment + channel filters)
  /customers/[customerId]             → Customer profile (RFM, timeline, orders, opt-out)

  /orders                             → Orders list (channel + date range filters)

  /segments                           → All 6 segment cards + comparison charts
  /segments/[segmentName]             → Segment detail + paginated customer list

  /import                             → Upload zone + job history list
  /import/[jobId]                     → Import job detail (progress, error rows)

  Internal API routes (never visited directly):
  /api/auth/login                     → POST: validate password, set session
  /api/auth/logout                    → POST: destroy session
  /api/proxy/[...path]                → ALL METHODS: transparent BFF proxy

  ---
  5. Layout Hierarchy

  RootLayout                          src/app/layout.tsx
    html (lang="en")
    body
    └── Providers
          ├── QueryProvider           (TanStack Query client)
          └── ToastProvider           (shadcn Toaster)

    ├── AuthLayout                    src/app/(auth)/layout.tsx
    │   (bare page, no nav)
    │   └── LoginPage
    │
    └── DashboardLayout               src/app/(dashboard)/layout.tsx
          Auth guard (server-side session check → redirect /login)
          ├── Sidebar
          │     Brand logo mark
          │     Navigation links (icon + label)
          │     Collapse toggle (icon-only mode on narrow viewports)
          │     Bottom: version / status indicator
          │
          ├── Main wrapper
          │     TopBar
          │       Left: Page breadcrumb (optional)
          │       Right: Import shortcut, user menu
          │
          └── Page content (slot for each page)

  Sidebar Navigation Items:
  1. Dashboard (/dashboard) — LayoutDashboard icon
  2. Campaigns (/campaigns) — Megaphone icon
  3. Customers (/customers) — Users icon
  4. Orders (/orders) — ShoppingBag icon
  5. Segments (/segments) — PieChart icon
  6. Import (/import) — Upload icon

  Active item: indigo-600 text + indigo-50 background pill on the sidebar (dark sidebar variant: white text + indigo-600 background).

  ---
  6. Authentication Flow

  Strategy: Single-operator shared password. No OAuth, no user accounts. Appropriate for an internal CRM tool accessible only to the brand operator.

  Environment Variables (server-side only, never NEXT_PUBLIC_):
  - CRM_API_URL — backend base URL
  - CRM_API_SECRET — the API_SECRET_TOKEN from the CRM backend
  - SESSION_SECRET — 32+ character random string for iron-session encryption
  - ADMIN_PASSWORD — frontend login password

  Flow:
  1. User visits /dashboard
  2. middleware.ts (Edge): reads iron-session cookie
     → no valid session → redirect to /login?from=/dashboard
  3. Login page: user enters password → POST /api/auth/login
  4. /api/auth/login route:
     → compares with ADMIN_PASSWORD (timing-safe comparison)
     → on success: creates iron-session cookie { authenticated: true }
     → returns 200 → client redirects to ?from param
     → on failure: returns 401 → login page shows error
  5. All subsequent requests:
     → Browser fetches /api/proxy/[...path]
     → BFF route reads session → valid → injects Authorization: Bearer <CRM_API_SECRET>
     → Forwards to CRM_API_URL/api/v1/[...path]
     → Returns response to browser
  6. Logout: POST /api/auth/logout → destroys session → redirect /login

  BFF Proxy Route Behavior:
  - Copies method, headers (minus host/cookie), body from browser request
  - Injects Authorization: Bearer ${process.env.CRM_API_SECRET}
  - Forwards multipart/form-data for CSV uploads unchanged
  - Streams response back to browser
  - On CRM backend errors: passes through the error JSON and status code unchanged

  ---
  7. API Layer Design

  Base Client (src/lib/api/client.ts)

  export class ApiError extends Error {
    statusCode: number
    code: string
    field?: string
  }

  async function apiFetch<T>(
    path: string,
    init?: RequestInit
  ): Promise<T>

  Behavior:
    - Prepends /api/proxy to every path
    - On non-2xx: reads { error: { code, message, field } } envelope → throws ApiError
    - On network error: throws ApiError with code NETWORK_ERROR
    - Content-Type: application/json for non-multipart requests

  Per-Resource Modules

  src/lib/api/campaigns.ts
  listCampaigns(params: { status?, cursor?, limit? }) → PaginatedResponse<Campaign>
  getCampaign(id: string) → Campaign
  getCampaignStats(id: string) → CampaignStats
  getCampaignMessages(id: string, params: { cursor?, limit? }) → PaginatedResponse<CampaignMessage>
  markCampaignReady(id: string) → { campaignId, status }
  launchCampaign(id: string, scheduledAt?: string) → LaunchResult
  previewAudience(body: AudiencePreviewInput) → AudiencePreviewResult

  src/lib/api/ai.ts
  extractIntent(goalText: string) → IntentExtractionResult
  previewAudienceWithAI(body: AudiencePreviewInput) → AIPreviewResult
  generateCampaign(body: GenerateCampaignInput) → GeneratedCampaignResult
  refineCampaign(campaignId: string, userFeedback?: string) → CritiqueResult

  src/lib/api/customers.ts
  listCustomers(params: { rfmSegment?, tag?, channel?, search?, cursor?, limit? }) → PaginatedResponse<Customer>
  getCustomer(id: string) → Customer
  getCustomerCommunications(id: string) → CommunicationEvent[]
  updateOptOut(id: string, body: { channel, optedOut }) → Customer

  src/lib/api/segments.ts
  listSegments() → SegmentAggregate[]
  getSegmentCustomers(segmentName: string, params: { cursor?, limit? }) → PaginatedResponse<Customer>

  src/lib/api/orders.ts
  listOrders(params: { customerId?, channel?, startDate?, endDate?, cursor?, limit? }) → PaginatedResponse<Order>
  getOrder(id: string) → Order

  src/lib/api/importJobs.ts
  uploadCsv(file: File, type: 'CUSTOMERS' | 'ORDERS') → { jobId }
  getImportJob(jobId: string) → ImportJob
  listImportJobs(params: { cursor?, limit? }) → PaginatedResponse<ImportJob>

  ---
  8. React Query Strategy

  Query Key Factory (src/lib/utils/queryKeys.ts)

  All query keys are factory functions that produce typed tuples, ensuring invalidation is precise and predictable.

  queryKeys = {
    campaigns: {
      all:     ['campaigns'],
      list:    (filters) → ['campaigns', 'list', filters],
      detail:  (id) → ['campaigns', 'detail', id],
      stats:   (id) → ['campaigns', 'detail', id, 'stats'],
      messages:(id, cursor?) → ['campaigns', 'detail', id, 'messages', cursor],
    },
    customers: {
      all:           ['customers'],
      list:          (filters) → ['customers', 'list', filters],
      detail:        (id) → ['customers', 'detail', id],
      communications:(id) → ['customers', 'detail', id, 'communications'],
    },
    orders: {
      all:  ['orders'],
      list: (filters) → ['orders', 'list', filters],
    },
    segments: {
      all:       ['segments'],
      list:      () → ['segments', 'list'],
      customers: (name, cursor?) → ['segments', name, 'customers', cursor],
    },
    importJobs: {
      all:    ['import'],
      list:   (cursor?) → ['import', 'list', cursor],
      detail: (id) → ['import', 'detail', id],
    },
  }

  Stale Time Policy

  ┌───────────────────────────────┬────────────┬─────────────────────────────────────┐
  │             Query             │ staleTime  │           refetchInterval           │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Segment list                  │ 5 minutes  │ —                                   │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Dashboard campaign counts     │ 60s        │ —                                   │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Campaign list                 │ 30s        │ —                                   │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Campaign detail               │ 30s        │ —                                   │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Campaign stats (ACTIVE)       │ 15s        │ 15s (while page focused)            │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Campaign stats (COMPLETED)    │ 10 minutes │ —                                   │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Campaign messages             │ 30s        │ —                                   │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Customer list                 │ 60s        │ —                                   │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Customer detail               │ 60s        │ —                                   │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Customer communications       │ 60s        │ —                                   │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Orders                        │ 5 minutes  │ —                                   │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Import job (PROCESSING)       │ 0          │ 3s (polling until COMPLETED/FAILED) │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Import job (COMPLETED/FAILED) │ 10 minutes │ —                                   │
  ├───────────────────────────────┼────────────┼─────────────────────────────────────┤
  │ Import job list               │ 30s        │ —                                   │
  └───────────────────────────────┴────────────┴─────────────────────────────────────┘

  Infinite Queries (cursor pagination)

  Used for: customer list, campaign messages, segment customers, import job list, orders list.

  useInfiniteQuery pattern:
    queryKey: queryKeys.customers.list(filters)
    queryFn: ({ pageParam: cursor }) → listCustomers({ ...filters, cursor })
    getNextPageParam: (lastPage) → lastPage.pagination.nextCursor ?? undefined
    initialPageParam: undefined

  The UI renders all pages flattened (pages.flatMap(p => p.data)), with a "Load More" button appearing when hasNextPage is true.

  Mutation Strategy + Cache Invalidation

  Launch Campaign:
  useMutation → launchCampaign(id)
  onMutate: optimistically set campaign.status = 'LAUNCHING' in cache
  onSuccess: invalidate campaigns.detail(id), campaigns.list(*)
  onError: rollback optimistic update + toast error

  Mark Campaign Ready:
  useMutation → markCampaignReady(id)
  onSuccess: invalidate campaigns.detail(id), campaigns.list(*)

  Opt-Out Toggle:
  useMutation → updateOptOut(customerId, { channel, optedOut })
  onSuccess: invalidate customers.detail(customerId)

  CSV Upload:
  useMutation → uploadCsv(file, type)
  onSuccess:
    - Store jobId in local state
    - Enable polling on importJobs.detail(jobId) (refetchInterval: 3s)
    - Navigate to /import/[jobId]
    - invalidate importJobs.list(*)

  ---
  9. State Management Strategy

  Server State: TanStack Query

  All data that originates from the API lives exclusively in TanStack Query's cache. Never duplicated in Zustand or component state.

  Client State: Zustand

  campaignWizardStore.ts — Persists across the 5-step wizard (step navigation destroys component state without this):
  {
    step: 1 | 2 | 3 | 4 | 5
    goalText: string
    intentResult: IntentExtractionResult | null
    audiencePreview: AIPreviewResult | null
    generatedCampaign: GeneratedCampaignResult | null     // set after step 3
    critiqueResult: CritiqueResult | null                  // set after step 4
    campaignId: string | null                              // set after generate saves DRAFT

    // Actions
    setStep(n)
    setGoalText(text)
    setIntentResult(result)
    setAudiencePreview(preview)
    setGeneratedCampaign(result)
    setCritiqueResult(result)
    reset()                                               // called on wizard exit or completion
  }

  uiStore.ts — UI preferences:
  {
    sidebarCollapsed: boolean
    toggleSidebar()
  }

  URL State (useSearchParams)

  Filters, active tab, and pagination cursors live in the URL so that:
  - Browser back button restores exact filter state
  - Links are shareable
  - Refresh preserves view

  URL state used for:
  - /campaigns?status=ACTIVE — active tab
  - /customers?segment=CHAMPIONS&search=raj — filter params
  - /orders?channel=EMAIL&startDate=...&endDate=...
  - Cursor values are NOT in the URL (replaced by Load More pattern)

  Component State (useState/useReducer)

  - Dialog open/closed
  - Form field values managed by React Hook Form
  - Hover/tooltip states
  - Multi-select row selection in tables

  ---
  10. Type Organization (src/lib/types/)

  api.ts — Shared envelope types

  type ApiResponse<T> = { data: T }
  type PaginatedResponse<T> = {
    data: T[]
    pagination: { hasMore: boolean; nextCursor: string | null }
  }
  type ApiError = { error: { code: string; message: string; field?: string } }

  campaign.ts

  type CampaignStatus = 'DRAFT' | 'READY_FOR_REVIEW' | 'LAUNCHING' | 'ACTIVE' | 'COMPLETED' | 'FAILED'
  type IntentType = 'WIN_BACK_DORMANT' | 'REWARD_TOP_SPENDERS' | 'RE_ENGAGE_SINGLE_PURCHASE' | 'UPSELL_CATEGORY' | 'VIP_LOYALTY'
  type Channel = 'WHATSAPP' | 'EMAIL' | 'SMS'
  type MessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'OPENED' | 'CLICKED' | 'CONVERTED'

  interface Campaign { _id, name, goalText, goalType, status, intentType, intentParameters, audienceSnapshot, totalRecipients, scheduledAt,
  launchedAt, completedAt, revenueEstimate, aiReport, aiReportGeneratedAt, createdAt, draftSavedAt }
  interface CampaignCluster { _id, campaignId, clusterLabel, clusterDescription, memberCount, assignedChannel, channelConfidence, message: {
  subject, body, ctaText, ctaUrl }, stats: { queued, sent, delivered, failed, opened, clicked, converted } }
  interface CampaignMessage { _id, campaignId, clusterId, customerId, channel, recipient, status, customerName, customerPhone, sentAt, deliveredAt,
  openedAt, clickedAt, convertedAt, failedAt, createdAt }
  interface CampaignStats { campaignId, stats: { queued, sent, delivered, failed, opened, clicked, converted }, rates: { deliveryRate, openRate,
  clickRate, conversionRate }, clusters: ClusterStatSummary[] }

  customer.ts

  type RfmSegment = 'CHAMPIONS' | 'PROMISING' | 'AT_RISK_LOYALISTS' | 'DORMANT_VIPS' | 'LAPSED_LOW_VALUE' | 'GENERAL'
  interface Customer { _id, phone, name, email, source, tags, optOutChannels, lastOrderAt, totalOrders, totalSpend, rfmR, rfmF, rfmM, rfmSegment,
  createdAt, updatedAt }
  interface CommunicationEvent { _id, messageId, campaignId, channel, eventType, eventTimestamp }

  segment.ts

  interface SegmentAggregate { segment, count, percentOfTotal, avgSpend, avgOrderFrequency, avgDaysSinceLastOrder }

  ai.ts

  interface IntentExtractionResult { intentType, parameters, confirmationText, suggestedName, aiLogId }
  interface ClusterCard { label, count, rfmSegment, avgSpend, reachability, toneRecommendation, persona: PersonaCard | null }
  interface AIPreviewResult { narrative, narrativeValid, clusterCards, revenueEstimate: { min, max, conversionRate, source } }
  interface GeneratedCampaignResult { campaign: Campaign, clusters: CampaignCluster[] }
  interface CritiqueResult { critiqueApplied, deterministicIssues, critiqueNotes, changesApplied, refinedMessages, aiLogId }

  All types mirror the exact field names from the backend models. No renaming, no aliasing — the TypeScript is the documentation.

  ---
  11. Error Handling Strategy

  Three tiers of error display, matched to error severity and context:

  Tier 1 — Toast Notifications (mutation errors)

  When a user action fails (launch, opt-out, upload), a toast appears in the bottom-right corner:
  - Color: red/danger
  - Shows: human-readable message from error.message
  - Auto-dismiss: 5 seconds
  - Example: "Campaign could not be launched. It may have already been launched by another session."

  Tier 2 — Inline Error (query errors in a panel/section)

  When a subsection of a page fails to load, show an inline error state within that section rather than crashing the whole page:
  [AlertCircle icon]  Failed to load campaign stats
                      [Retry button]
  Implemented via ErrorState component placed inside each <QueryErrorResetBoundary>.

  Tier 3 — Full-page Error Boundary

  For catastrophic failures (MongoDB down, proxy unreachable), show a full-page error within the dashboard layout:
  [Server icon]  Something went wrong
                 We couldn't reach the CRM service.
                 [Try Again]  [Go to Dashboard]

  Form Validation Errors

  React Hook Form + Zod shows field-level inline errors below each input. No toast for validation — validation errors are synchronous and the user
  needs to see which field is wrong. Mirror backend constraints in frontend Zod schemas (e.g., goalText min 10, max 500) to catch errors before
  round-trip.

  ApiError Class Properties

  statusCode  — used for conditional UI (401 → redirect login, 422 → show state conflict message)
  code        — 'VALIDATION_ERROR', 'NOT_FOUND', 'UNAUTHORIZED', 'INVALID_TRANSITION', etc.
  field       — highlight specific input field on 400 validation errors
  message     — human-readable, shown directly in toast

  ---
  12. Loading State Strategy

  Rule: every data-dependent UI region has a skeleton that matches the shape of the real content.

  No full-page spinners. No blank white screens. Skeletons are composed from Skeleton (shadcn/ui base) and assembled into page-specific components.

  ┌─────────────────────────┬────────────────────────────────────────────────────────────────┐
  │        Component        │                            Skeleton                            │
  ├─────────────────────────┼────────────────────────────────────────────────────────────────┤
  │ KPI cards row (4 cards) │ SkeletonCards — 4 rounded rectangles with pulse animation      │
  ├─────────────────────────┼────────────────────────────────────────────────────────────────┤
  │ Data table              │ SkeletonTable — N rows × M columns of varying-width rectangles │
  ├─────────────────────────┼────────────────────────────────────────────────────────────────┤
  │ Campaign card           │ Skeleton that matches CampaignCard dimensions                  │
  ├─────────────────────────┼────────────────────────────────────────────────────────────────┤
  │ Funnel chart            │ Horizontal rectangle set matching bar widths                   │
  ├─────────────────────────┼────────────────────────────────────────────────────────────────┤
  │ Donut chart             │ Circle skeleton                                                │
  ├─────────────────────────┼────────────────────────────────────────────────────────────────┤
  │ Customer profile header │ Avatar circle + two lines                                      │
  ├─────────────────────────┼────────────────────────────────────────────────────────────────┤
  │ Timeline events         │ Vertical list of dot + line + text skeletons                   │
  └─────────────────────────┴────────────────────────────────────────────────────────────────┘

  Suspense Boundaries: Each page uses a <Suspense> boundary wrapping data-dependent sections. This allows the page header and static chrome to
  render immediately while data loads.

  Mutation Loading States:
  - Buttons enter a "pending" visual state (disabled + spinner icon inside button) during any mutation
  - Forms disable all inputs during submission
  - Campaign wizard steps show a full-step loading overlay during AI calls (which can take 3–8 seconds)

  AI Call Loading (special case):
  The AI pipeline calls can take 5–10 seconds. During these calls, show an animated progress indicator with informative copy:
  - Step 1 loading: "Analyzing your goal..."
  - Step 2 loading: "Building your audience..." with an animated percentage bar
  - Step 3 loading: "Generating campaign messages..." with a typing-style animation
  - Step 4 loading: "Reviewing messages for quality..."

  This transforms latency into anticipation, consistent with what Segment and HubSpot do for their AI features.

  ---
  13. Table Strategy

  Base: TanStack Table v8 (headless) wrapped in DataTable.tsx.

  DataTable accepts:
  - columns: ColumnDef[] — typed column definitions
  - data: T[] — the row data
  - isLoading?: boolean — switches to SkeletonTable
  - emptyState?: ReactNode — shown when data.length === 0 and not loading
  - filterBar?: ReactNode — slot above table for filter controls
  - paginationSlot?: ReactNode — slot below for Load More or page controls

  Per-table column definitions live in the feature component folders, not in DataTable itself. Example: src/components/campaigns/columns.tsx.

  Sorting: Client-side sorting on the current page's data only. No server-side sort — the backend does not expose sort parameters.

  Column Visibility: All tables with >4 columns have a ColumnVisibilityToggle dropdown in the top-right. Column visibility preferences can be stored
   in localStorage.

  Row Actions: Each row has an actions column with a DropdownMenu (vertical ellipsis). Actions vary by entity type and row state.

  Virtual Scrolling: Used for CommunicationTimeline (potentially hundreds of events) and campaign messages tables (potentially thousands of rows).
  Implemented via TanStack Virtual, integrated into DataTable when a virtualHeight prop is provided.

  ---
  14. Form Strategy

  Library: React Hook Form + Zod resolver.

  Pattern: Each form has a corresponding Zod schema in src/lib/types/ that mirrors the backend's Zod schema. Frontend validation catches issues
  before the API call.

  Error display: Field-level error messages from Zod appear below each input using <InlineError>. The submit button only becomes active when the
  form is valid and not submitting.

  Campaign Wizard Forms:

  Step 1 — Goal Input:
  Schema: z.object({ goalText: z.string().min(5).max(500) })
  Field: <Textarea> rows={4}, placeholder with examples, character counter
  CTA: "Extract Intent →"

  Step 3 — Campaign Name:
  Schema: z.object({ name: z.string().min(1).max(200), goalText: z.string() })
  Pre-filled from AI suggestedName
  Editable before generate-campaign call

  Step 4 — Refinement (optional):
  Schema: z.object({ userFeedback: z.string().max(500).optional() })
  Textarea with "What would you like to change?" placeholder
  Clear prompt-injection warning is absent from UI (handled server-side, transparent to user)

  Step 5 — Schedule:
  Schema: z.object({ scheduledAt: z.string().datetime().optional() })
  DatePicker (optional) + "Launch immediately" toggle

  Opt-Out Form: Inline toggle switches — no separate form submit; each toggle fires its mutation immediately on change.

  CSV Upload: Not a traditional form. File input + type selector (customers/orders radio). Uploaded on file select (no extra submit).

  ---
  15. Chart Strategy

  All charts use Recharts with custom styled components. Each chart component:
  - Accepts data props, not the full query result
  - Handles the empty/loading state internally
  - Uses the project's color constants for consistency
  - Exports both the chart and a ChartSkeleton for loading states

  Chart Inventory

  FunnelChart.tsx
  Type: Custom horizontal funnel using BarChart with percentage labels
  Data: CampaignStats.stats — {sent, delivered, opened, clicked, converted}
  Visual: Five bars decreasing in width, each labeled with count + percentage of prior stage
  Color: Indigo gradient from dark (sent) to lighter (converted)
  Used on: Campaign detail page

  DonutChart.tsx
  Type: Recharts PieChart with inner radius (donut)
  Data: Segment distribution (count per segment) OR channel mix (count per channel)
  Visual: Colored segments with legend to the right; center shows total
  Colors: Segment color map or channel color map from constants
  Used on: Dashboard (segment distribution), Campaign detail (channel mix)

  SegmentBarChart.tsx
  Type: Horizontal BarChart
  Data: SegmentAggregate[] — one bar per segment, length = avgSpend
  Visual: Color-matched to segment colors; formatted ₹ labels on bars
  Used on: Segments overview page

  CampaignRatesBar.tsx
  Type: Grouped vertical BarChart
  Data: Multiple campaigns, each with deliveryRate/openRate/clickRate
  Visual: Three bars per campaign (delivery=indigo, open=emerald, click=amber)
  Used on: Dashboard campaign comparison section

  ChannelMixBar.tsx
  Type: Stacked horizontal BarChart
  Data: Channel counts from audienceSnapshot.channelMix
  Visual: WHATSAPP=green, EMAIL=blue, SMS=purple
  Used on: Campaign detail, Segments page

  ---
  16. Reusable Component Library (Design Tokens → Components)

  MetricCard

  Props: label, value, delta?, deltaLabel?, icon?, variant ('default' | 'success' | 'warning' | 'danger')
  Usage: KPI row on dashboard, segment detail header
  Visual: White card, metric number large (24px semibold tabular), label small (12px uppercase tracking-wide)

  StatusBadge

  Props: status (campaign status | message status | import job status)
  Visual: Pill shape, colored by status (see Color Palette section)
  Sizes: default (13px) and sm (11px) variants

  RfmSegmentBadge

  Props: segment: RfmSegment
  Visual: Colored dot + segment name, sized sm
  Color map: CHAMPIONS=emerald, PROMISING=blue, AT_RISK=amber, DORMANT=orange, LAPSED=rose, GENERAL=slate

  ChannelBadge

  Props: channel: Channel
  Visual: Icon (WhatsApp leaf, Mail, MessageSquare) + channel name
  Colors: WHATSAPP=green-700, EMAIL=blue-600, SMS=purple-600

  EmptyState

  Props: icon, heading, description, action?: { label, onClick }
  Usage: Every empty list or empty chart
  Visual: Centered layout, icon in muted circle, heading slate-900, description slate-500

  ConfirmDialog

  Props: open, title, description, confirmLabel, variant ('default' | 'destructive'), onConfirm, onCancel
  Usage: Campaign launch confirmation, opt-out toggle confirmation

  CursorPagination

  Props: hasMore, isLoading, onLoadMore, totalLoaded, entityName
  Visual: "Showing 20 customers · Load 20 more" centered below table

  TimestampCell

  Props: date: Date | string | null
  Visual: Relative time ("3 hours ago") with full ISO timestamp on hover tooltip
  Uses date-fns formatDistanceToNow and format

  ---
  17. Design System

  Spacing Scale

  Based on Tailwind's 4px grid. Primary spacings used in layouts: p-4 (16px), p-6 (24px), gap-4, gap-6, gap-8.

  Border Radius

  - Small elements (badges, tags): rounded-md (6px)
  - Cards, inputs: rounded-lg (8px)
  - Modals, large panels: rounded-xl (12px)

  Shadow Scale

  - Cards: shadow-sm (subtle elevation)
  - Dropdowns, tooltips: shadow-md
  - Modals: shadow-xl

  Sidebar

  - Background: slate-900
  - Active nav item: bg-indigo-600 text white
  - Hover nav item: bg-slate-800 text slate-200
  - Inactive nav item: text slate-400
  - Width: 240px expanded, 64px collapsed

  Card

  - Background: white
  - Border: border border-slate-200
  - Shadow: shadow-sm
  - Padding: p-6

  Page Background

  - bg-slate-50 — slight off-white that makes white cards pop

  ---
  18. Color Palette

  Base Palette:

  ┌────────────────┬─────────────┬─────────┬────────────────────────────────────────┐
  │     Token      │  Tailwind   │   Hex   │                 Usage                  │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ bg-page        │ slate-50    │ #F8FAFC │ Page background                        │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ bg-surface     │ white       │ #FFFFFF │ Cards, panels                          │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ bg-raised      │ slate-100   │ #F1F5F9 │ Hover states, nested surfaces          │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ border-default │ slate-200   │ #E2E8F0 │ Card borders, dividers                 │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ border-strong  │ slate-300   │ #CBD5E1 │ Emphasized dividers                    │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ text-primary   │ slate-900   │ #0F172A │ Headings, primary text                 │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ text-secondary │ slate-600   │ #475569 │ Labels, descriptions                   │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ text-tertiary  │ slate-400   │ #94A3B8 │ Placeholders, metadata                 │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ brand          │ indigo-600  │ #4F46E5 │ Primary CTAs, active nav, focus rings  │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ brand-light    │ indigo-50   │ #EEF2FF │ Tinted surfaces, selected rows         │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ brand-hover    │ indigo-700  │ #4338CA │ Button hover                           │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ success        │ emerald-500 │ #10B981 │ Delivered, completed, positive metrics │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ success-light  │ emerald-50  │ #ECFDF5 │ Success badge background               │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ warning        │ amber-500   │ #F59E0B │ Processing, launching, at-risk         │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ warning-light  │ amber-50    │ #FFFBEB │ Warning badge background               │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ danger         │ rose-500    │ #F43F5E │ Failed, errors, destructive actions    │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ danger-light   │ rose-50     │ #FFF1F2 │ Error badge background                 │
  ├────────────────┼─────────────┼─────────┼────────────────────────────────────────┤
  │ info           │ blue-500    │ #3B82F6 │ Ready for review, informational        │
  └────────────────┴─────────────┴─────────┴────────────────────────────────────────┘

  Status Colors (Campaign):

  ┌──────────────────┬─────────────┬────────────┐
  │      Status      │ Text Color  │ Background │
  ├──────────────────┼─────────────┼────────────┤
  │ DRAFT            │ slate-600   │ slate-100  │
  ├──────────────────┼─────────────┼────────────┤
  │ READY_FOR_REVIEW │ blue-600    │ blue-50    │
  ├──────────────────┼─────────────┼────────────┤
  │ LAUNCHING        │ amber-600   │ amber-50   │
  ├──────────────────┼─────────────┼────────────┤
  │ ACTIVE           │ emerald-600 │ emerald-50 │
  ├──────────────────┼─────────────┼────────────┤
  │ COMPLETED        │ indigo-600  │ indigo-50  │
  ├──────────────────┼─────────────┼────────────┤
  │ FAILED           │ rose-600    │ rose-50    │
  └──────────────────┴─────────────┴────────────┘

  RFM Segment Colors:

  ┌───────────────────┬─────────┐
  │      Segment      │  Color  │
  ├───────────────────┼─────────┤
  │ CHAMPIONS         │ emerald │
  ├───────────────────┼─────────┤
  │ PROMISING         │ blue    │
  ├───────────────────┼─────────┤
  │ AT_RISK_LOYALISTS │ amber   │
  ├───────────────────┼─────────┤
  │ DORMANT_VIPS      │ orange  │
  ├───────────────────┼─────────┤
  │ LAPSED_LOW_VALUE  │ rose    │
  ├───────────────────┼─────────┤
  │ GENERAL           │ slate   │
  └───────────────────┴─────────┘

  Channel Colors:

  ┌──────────┬────────────┬─────────────┐
  │ Channel  │ Icon Color │ Badge Color │
  ├──────────┼────────────┼─────────────┤
  │ WHATSAPP │ green-600  │ green-50    │
  ├──────────┼────────────┼─────────────┤
  │ EMAIL    │ blue-600   │ blue-50     │
  ├──────────┼────────────┼─────────────┤
  │ SMS      │ purple-600 │ purple-50   │
  └──────────┴────────────┴─────────────┘

  ---
  19. Typography

  Font Family: Geist Sans (via next/font/google or Vercel's local Geist package) for all UI. Geist Mono for code/ID values, token previews, message
  bodies.

  Scale:

  ┌────────────────────┬──────┬────────┬─────────────────────────────────────────────┐
  │        Use         │ Size │ Weight │                    Class                    │
  ├────────────────────┼──────┼────────┼─────────────────────────────────────────────┤
  │ Page heading       │ 24px │ 600    │ text-2xl font-semibold                      │
  ├────────────────────┼──────┼────────┼─────────────────────────────────────────────┤
  │ Section heading    │ 18px │ 600    │ text-lg font-semibold                       │
  ├────────────────────┼──────┼────────┼─────────────────────────────────────────────┤
  │ Card heading       │ 15px │ 600    │ text-[15px] font-semibold                   │
  ├────────────────────┼──────┼────────┼─────────────────────────────────────────────┤
  │ KPI metric number  │ 28px │ 700    │ text-3xl font-bold tabular-nums             │
  ├────────────────────┼──────┼────────┼─────────────────────────────────────────────┤
  │ Body text          │ 14px │ 400    │ text-sm                                     │
  ├────────────────────┼──────┼────────┼─────────────────────────────────────────────┤
  │ Label              │ 12px │ 500    │ text-xs font-medium uppercase tracking-wide │
  ├────────────────────┼──────┼────────┼─────────────────────────────────────────────┤
  │ Table cell         │ 14px │ 400    │ text-sm                                     │
  ├────────────────────┼──────┼────────┼─────────────────────────────────────────────┤
  │ Badge              │ 11px │ 500    │ text-[11px] font-medium                     │
  ├────────────────────┼──────┼────────┼─────────────────────────────────────────────┤
  │ Metadata/timestamp │ 12px │ 400    │ text-xs text-slate-400                      │
  └────────────────────┴──────┴────────┴─────────────────────────────────────────────┘

  tabular-nums applied to all metric numbers, percentages, and currency values to prevent layout shift as values update.

  Line Height: leading-tight (1.25) for headings, leading-normal (1.5) for body, leading-relaxed (1.625) for descriptive text.

  ---
  20. Dashboard Page

  Purpose: Executive overview. Surface key KPIs, segment health, recent campaign performance, and recent data activity. Entry point for every
  session.

  Route: /dashboard

  Data Sources & API Calls:

  ┌────────────────────────────────────────┬─────────────────────────────────────────┬─────────────────────────────────────────────┐
  │                  Data                  │                API Call                 │                    Notes                    │
  ├────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Segment distribution + total customers │ GET /segments                           │ Total customers = sum of all segment counts │
  ├────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Active campaigns                       │ GET /campaigns?status=ACTIVE&limit=5    │ Show count + cards                          │
  ├────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Completed campaigns                    │ GET /campaigns?status=COMPLETED&limit=5 │ For performance comparison                  │
  ├────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Draft campaigns                        │ GET /campaigns?status=DRAFT&limit=5     │ For "in progress" indicator                 │
  ├────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────────┤
  │ Recent import jobs                     │ GET /import?limit=5                     │ Data freshness indicator                    │
  └────────────────────────────────────────┴─────────────────────────────────────────┴─────────────────────────────────────────────┘

  All 4 queries fire in parallel via Promise.all semantics (separate useQuery calls that React renders simultaneously).

  Page Layout:
  PageHeader: "Dashboard"              [+ New Campaign button → /campaigns/new]

  Row 1 — KPI Cards (4 columns):
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ Total         │  │ Active        │  │ Completed     │  │ Drafts        │
    │ Customers     │  │ Campaigns     │  │ Campaigns     │  │ in Progress   │
    │  1,247        │  │   3           │  │   12          │  │   2           │
    └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

  Row 2 (two columns):
    Left (60%):  Segment Distribution
                 DonutChart (count per segment) + legend table
                 Subtitle: "Based on last RFM computation"

    Right (40%): Recent Activity
                 Latest import job status (filename, rows, status badge, timestamp)
                 + link to /import

  Row 3 (two columns):
    Left (60%):  Recent Campaigns
                 Mini-table: name | status badge | audience size | channel mix | launched date
                 Each row links to /campaigns/[id]
                 Footer: "View all campaigns →"

    Right (40%): Segment Revenue Snapshot
                 Horizontal bar chart: avgSpend per segment
                 (Segment colors consistent with RfmSegmentBadge)

  Components Required: MetricCard, DonutChart, SegmentBarChart, CampaignCard (mini variant), StatusBadge, RfmSegmentBadge, SkeletonCards,
  SkeletonTable, EmptyState

  User Actions:
  - Click "New Campaign" → navigate to /campaigns/new
  - Click campaign row → navigate to /campaigns/[id]
  - Click segment in chart → navigate to /segments/[segmentName]
  - Click import row → navigate to /import/[jobId]

  Charts Required: DonutChart (segment distribution), SegmentBarChart (avg spend)
  Tables Required: Recent campaigns mini-table (5 rows, no pagination)

  ---
  21. Campaign Pages

  21a. Campaign List (/campaigns)

  Purpose: Central hub for all campaign management. Browse, filter, and initiate actions on campaigns.

  Route: /campaigns

  Data Sources: GET /campaigns with status filter derived from active tab

  URL State: ?status=ACTIVE (tab state persisted in URL)

  Page Layout:
  PageHeader: "Campaigns"             [+ New Campaign]

  Status Tabs: All | Draft | Active | Completed | Failed
               (Each tab shows count badge when data is loaded)

  Campaign Grid (card layout, not table):
    ┌─────────────────────────────┐  ┌─────────────────────────────┐
    │ [Status Badge] [Channel Mix] │  │                             │
    │ Campaign Name                │  │  ...                        │
    │ Goal text (truncated)        │  │                             │
    │ ─────────────────────────── │  │                             │
    │ 👥 1,247 recipients          │  │                             │
    │ 📅 Launched 3 days ago       │  │                             │
    │ ──────────────────────────  │  │                             │
    │ [View Details]  [Stats ↗]   │  │                             │
    └─────────────────────────────┘  └─────────────────────────────┘

  Load More button at bottom

  Components: CampaignCard, StatusBadge, ChannelBadge, EmptyState ("No campaigns yet. Create your first campaign."), SkeletonCards, CursorPagination

  User Actions:
  - Switch status tabs → updates ?status= query param, refetches
  - Click "View Details" → /campaigns/[id]
  - Click "New Campaign" → /campaigns/new
  - Load More → fetchNextPage()

  Charts: Channel mix chip pills on each card (not a chart — just colored badges)

  Empty State (per tab):
  - Draft: "No draft campaigns. [Create one →]"
  - Active: "No active campaigns right now."
  - Completed: "No completed campaigns yet."
  - Failed: "No failed campaigns."

  ---
  21b. Campaign Creation Wizard (/campaigns/new)

  Purpose: AI-assisted campaign creation. The core differentiating UX feature. Transforms a natural language goal into a ready-to-launch campaign
  with audience segmentation and personalized messages.

  Route: /campaigns/new

  State: Zustand campaignWizardStore (persists across step navigation)

  Layout: Full-screen wizard shell within the dashboard layout. Sidebar remains visible. Content area shows a stepper at top and active step content
   below.

  Step Indicator: [1: Goal] → [2: Preview] → [3: Generate] → [4: Refine] → [5: Launch]
                   ●──────────────○───────────────○──────────────○──────────────○

  ---
  Step 1: Describe Your Goal

  Data Sources: none initially; POST /ai/intent-extract on submit

  UI:
  Heading: "What do you want to achieve with this campaign?"
  Subtext: "Describe your marketing goal in plain language."

  ┌──────────────────────────────────────────────────────────┐
  │ "Win back customers who haven't ordered in 90 days and  │
  │  offer them a reason to come back"                       │
  │                                                          │
  │                                             (342/500)    │
  └──────────────────────────────────────────────────────────┘

  Example prompts:
    "Re-engage dormant VIP customers"
    "Reward my top spenders this month"
    "Reach customers who only ordered once"

  [Extract Intent →]  (disabled if < 5 chars)

  After AI call (loading: "Analyzing your goal..."):
  AI recognized your intent:

  ┌──────────────────────────────────────────────────────────┐
  │  ✓ WIN BACK DORMANT CUSTOMERS                            │
  │                                                          │
  │  "I'll target customers who haven't purchased in the    │
  │   last 90 days, with a focus on re-engagement."         │
  │                                                          │
  │  Parameters detected:                                    │
  │    Dormancy threshold: 90 days                           │
  └──────────────────────────────────────────────────────────┘

  [← Edit Goal]  [Continue to Preview →]

  API Calls: POST /ai/intent-extract
  Components: Textarea, Button (loading state), intent result panel with Badge (intent type)

  ---
  Step 2: Audience Preview

  Data Sources: POST /ai/audience-preview (fires automatically when entering step 2, no DB write)

  Loading state: "Building your audience..." (animated)

  UI:
  Heading: "Your audience"

  Row of 3 stat panels:
  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐
  │ Audience    │  │ Revenue     │  │ Channel Mix             │
  │ Size        │  │ Estimate    │  │ ██████░░░░ WhatsApp 62% │
  │   847       │  │ ₹4.2–8.5L   │  │ ██░░░░░░░░ Email 28%   │
  │ customers   │  │ est. 6% CVR │  │ █░░░░░░░░░ SMS 10%      │
  └─────────────┘  └─────────────┘  └─────────────────────────┘

  Audience Narrative:
  ┌──────────────────────────────────────────────────────────┐
  │  [AI-generated narrative from audienceNarrative.service] │
  └──────────────────────────────────────────────────────────┘

  Cluster Breakdown (for each cluster card):
  ┌──────────────────────────────────────────────────────────┐
  │  DORMANT VIPS          ChannelBadge: WhatsApp  847 people│
  │  ─────────────────────────────────────────────────────── │
  │  Tone: Re-engagement, value-led                          │
  │  Avg. spend: ₹3,200   Dormant: 90+ days                 │
  │                                                          │
  │  Persona: "Priya, 28–35, purchased 3x, last active       │
  │  4 months ago, price-sensitive but brand loyal"          │
  └──────────────────────────────────────────────────────────┘

  [← Back]  [Generate Campaign →]  (launches step 3)

  API Calls: POST /ai/audience-preview
  Components: MetricCard (3 variants), ChannelMixBar, narrative text panel, ClusterCard (preview variant without messages)

  ---
  Step 3: Review Campaign

  Data Sources: POST /ai/generate-campaign (fires on entering step 3, saves DRAFT to DB)

  Loading state: "Generating your campaign messages..." (7–10 second wait; show animated typewriter effect on placeholder text)

  UI:
  Heading: "Campaign Generated"

  Campaign Name:
  ┌──────────────────────────────────────────────────────────┐
  │  [Pre-filled from AI suggestedName — editable input]     │
  └──────────────────────────────────────────────────────────┘

  For each cluster:
  ┌──────────────────────────────────────────────────────────┐
  │  DORMANT VIPS                  [WhatsApp] [847 people]   │
  │  ─────────────────────────────────────────────────────── │
  │  WhatsApp Message:                       [160 / 160 ✓]  │
  │  ┌────────────────────────────────────┐                  │
  │  │ Hi {name}, we miss you! Your       │                  │
  │  │ favorites are waiting. Tap to      │                  │
  │  │ revisit: {ctaUrl}                  │                  │
  │  └────────────────────────────────────┘                  │
  │                                                          │
  │  Email Subject: "We miss you, {name}"    [28 / 50 ✓]   │
  │  Body: [Preview first 2 lines + expand]                  │
  └──────────────────────────────────────────────────────────┘

  [← Back]  [Skip Refinement, Go to Launch →]  [Refine Messages →]

  API Calls: POST /ai/generate-campaign
  Components: ClusterCard (full variant), MessagePreviewCard, name input

  ---
  Step 4: Refine (Optional)

  Data Sources: POST /ai/refine-campaign

  UI:
  Heading: "Refine Your Messages"
  Subtext: "Optional — describe any changes you want."

  ┌──────────────────────────────────────────────────────────┐
  │ "Make the WhatsApp messages more casual and add urgency" │
  └──────────────────────────────────────────────────────────┘

  [Run Refinement →]  (or skip)

  After critique:
  Deterministic Issues Found:
    [CritiqueIssueList] — expandable list with severity badges

  Changes Applied:
    DORMANT VIPS / WhatsApp
    Before: "We miss you..."
    After:  "Hey {name}! Don't miss out..."

  [Updated cluster message cards]

  [← Back]  [Continue to Launch →]

  API Calls: POST /ai/refine-campaign (using the campaign ID from step 3)
  Components: Textarea, CritiqueIssueList, change diff display, MessagePreviewCard

  ---
  Step 5: Schedule & Launch

  Data Sources: POST /campaigns/:id/ready, then POST /campaigns/:id/launch

  UI:
  Heading: "Ready to Launch"

  Campaign Summary:
    Name:       Win Back — Dormant VIPs
    Audience:   847 customers
    Channels:   WhatsApp (62%), Email (38%)
    Revenue Est: ₹4.2L – ₹8.5L

  Schedule:
    ○ Launch immediately
    ● Schedule for later: [DatePicker input]

  [Mark as Ready]  → [Launch Campaign]

  Both buttons in sequence:
    1. "Mark as Ready" → POST /campaigns/:id/ready → status becomes READY_FOR_REVIEW
    2. "Launch Campaign" → POST /campaigns/:id/launch → status becomes ACTIVE → navigate to /campaigns/[id]

  API Calls: POST /campaigns/:id/ready, POST /campaigns/:id/launch
  Components: Summary panel, DatePicker, ConfirmDialog (before launch), Button with loading states

  ---
  21c. Campaign Detail (/campaigns/[campaignId])

  Purpose: Deep-dive into a single campaign. Shows funnel performance, cluster breakdown, AI report, and provides launch actions for campaigns in
  pre-launch states.

  Route: /campaigns/[campaignId]

  Data Sources:
  - GET /campaigns/:id — campaign metadata
  - GET /campaigns/:id/stats — funnel stats (polled every 15s if status is ACTIVE)

  Page Layout:
  PageHeader: [Campaign Name]  [StatusBadge]          [Launch button if READY_FOR_REVIEW]
  Subtext: goalText | Created 3 days ago

  Row 1 — Info cards (3):
    Audience Size | Revenue Estimate | Channel Mix

  Row 2 (two columns):
    Left (65%): Funnel Performance
      FunnelChart: SENT → DELIVERED → OPENED → CLICKED → CONVERTED
      Below chart: rate metrics (deliveryRate, openRate, clickRate, conversionRate)
      Subtitle: "Live data" (pulse indicator if ACTIVE)

    Right (35%): Campaign Metadata
      Intent: [badge]
      Status: [badge]
      Launched: [date]
      Scheduled: [date if present]
      Total Recipients: [count]

  Row 3 — Cluster Breakdown
    One ClusterCard per cluster with:
      - Cluster label + RFM segment
      - Member count + assigned channel
      - Message body preview
      - Stats row: queued/sent/delivered/failed/opened/clicked/converted

  Row 4 — AI Report (only if aiReport is present)
    Collapsible panel: "AI Post-Campaign Analysis"
    Renders aiReport string as formatted text

  Row 5 — Actions
    [View All Messages →] links to /campaigns/[id]/messages
    If status is DRAFT: [Mark as Ready] button
    If status is READY_FOR_REVIEW: [Launch Now] + [Schedule] buttons

  Components: FunnelChart, DonutChart (channel mix), MetricCard, ClusterCard, CampaignStatusBadge, RevenueEstimatePanel, AiReportPanel,
  ConfirmDialog

  User Actions:
  - Launch campaign (if READY_FOR_REVIEW)
  - Mark as ready (if DRAFT)
  - View messages table
  - Expand/collapse AI report

  Charts: FunnelChart, optional DonutChart for channel mix

  ---
  21d. Campaign Messages (/campaigns/[campaignId]/messages)

  Purpose: Audit log of every dispatched message for a campaign. Shows delivery status per recipient.

  Route: /campaigns/[campaignId]/messages

  Data Sources: GET /campaigns/:id/messages (cursor pagination, ascending _id)

  Page Layout:
  PageHeader: "[Campaign Name] — Messages"    [← Back to Campaign]

  Filter row:
    [Status filter dropdown: All | Queued | Sent | Delivered | Opened | Clicked | Failed]

  Table columns:
    Customer Name | Phone/Email | Channel | Status | Sent At | Delivered At | Opened At | Clicked At | Failed Reason

  Footer: "Showing 50 of 847 messages"  [Load 50 More]

  Components: DataTable, ColumnVisibilityToggle, StatusBadge, ChannelBadge, TimestampCell, CursorPagination, SkeletonTable

  Status filter: Client-side filter on the loaded pages' data (no server-side filter parameter on this endpoint)

  Virtualization: TanStack Virtual enabled when total loaded rows > 200

  ---
  22. Customer Pages

  22a. Customer List (/customers)

  Purpose: Browse and search the full customer base. Filter by RFM segment, communication channel, and text search.

  Route: /customers

  Data Sources: GET /customers (filters: rfmSegment, tag, channel, search)

  URL State: ?segment=CHAMPIONS&search=raj&channel=WHATSAPP

  Page Layout:
  PageHeader: "Customers"

  Filter Bar:
    [Search input: "Search by name, phone, email..."]
    [Segment dropdown: All Segments | CHAMPIONS | PROMISING | ...]
    [Channel dropdown: All Channels | WhatsApp | Email | SMS]
    [Clear filters × ]

  Table columns:
    Name | Phone | RFM Segment | R/F/M Scores | Total Orders | Total Spend | Last Order | Opt-Out Channels | Actions

  Row actions: [View Profile →]
  Footer: CursorPagination

  Components: DataTable, SearchInput, FilterBar, RfmSegmentBadge, ChannelBadge, TimestampCell, CursorPagination

  Charts: None on this page

  ---
  22b. Customer Detail (/customers/[customerId])

  Purpose: Full 360-degree view of a single customer. RFM profile, order history, communication timeline, opt-out management.

  Route: /customers/[customerId]

  Data Sources:
  - GET /customers/:id — customer profile
  - GET /customers/:id/communications — event timeline
  - GET /orders?customerId=:id&limit=10 — recent orders

  Page Layout:
  PageHeader: [Customer Name]  [RfmSegmentBadge]  [← Back to Customers]

  Row 1 — Profile + RFM (two columns):
    Left (40%): Profile Card
      Name, phone (E.164 formatted), email, source badge
      Tags (pill list)
      Member since [date]
      Last order [date]

    Right (60%): RFM Score Panel
      Title: "Customer Intelligence"

      R Score: [1 2 3 4 5] — colored progress bar, current score highlighted
               "Recency: Ordered 45 days ago"
      F Score: [1 2 3 4 5]
               "Frequency: 4 orders"
      M Score: [1 2 3 4 5]
               "Monetary: ₹12,400 total spend"

      Segment: [RfmSegmentBadge]  "CHAMPIONS"

  Row 2 — Lifetime Stats (3 metric cards):
    Total Orders | Total Spend | Avg Order Value (totalSpend/totalOrders)

  Row 3 — Opt-Out Management:
    Card: "Communication Preferences"
    Per-channel toggle rows:
      WhatsApp: [Toggle: ON/OFF]   — PATCH /customers/:id/opt-out {channel:'WHATSAPP', optedOut}
      Email:    [Toggle: ON/OFF]
      SMS:      [Toggle: ON/OFF]
    Warning: "Opt-out changes take effect on the next campaign."

  Row 4 — Recent Orders (collapsible, shows last 5):
    Table: Order ID | Date | Amount | Channel | Attribution
    [View All Orders →] → /orders?customerId=:id

  Row 5 — Communication Timeline:
    Title: "All Communications"
    Virtualized timeline sorted by eventTimestamp descending:
      [Channel Icon] [EventType Badge] [Campaign ID truncated] [Timestamp]
      e.g., [📱 WhatsApp] [OPENED] Campaign: "Win Back" — 2 hours ago
    Empty: "No communication history yet."

  Components: RfmScoreDisplay, MetricCard, OptOutToggleRow, CommunicationTimeline, ChannelBadge, RfmSegmentBadge, DataTable (orders mini-table),
  TimestampCell

  User Actions:
  - Toggle opt-out per channel (fires mutation immediately)
  - View all orders → navigate to /orders?customerId=:id

  ---
  23. Orders Pages

  Orders List (/orders)

  Purpose: Browse all orders. Filter by channel and date range. Useful for auditing attribution and revenue.

  Route: /orders

  Data Sources: GET /orders (filters: customerId, channel, startDate, endDate)

  URL State: ?channel=EMAIL&startDate=2024-01-01&endDate=2024-03-31&customerId=xxx

  Page Layout:
  PageHeader: "Orders"

  Filter Bar:
    [Channel dropdown: All | WhatsApp | Email | SMS | Online | Offline]
    [Date Range Picker: Start date — End date]
    [Clear filters]

  Stats Row (3 cards, derived from visible page data):
    Total Orders Shown | Total Revenue Shown | Avg Order Value
    (Note: these are client-side aggregates on the loaded page — labeled accordingly)

  Table columns:
    Order ID | Customer Name | Amount | Channel | Order Date | Campaign Attribution | Discount Applied

  Row actions: [View Customer →] navigates to /customers/[customerId]
  Footer: CursorPagination

  Components: DataTable, FilterBar, DateRangePicker, ChannelBadge, MetricCard, CursorPagination, TimestampCell

  Note on Campaign Attribution: The campaignAttributedTo field shows which campaign (if any) was attributed to this order. Display as a truncated
  campaign name link if present.

  ---
  24. Segments Pages

  24a. Segments Overview (/segments)

  Purpose: Understand the health and distribution of the customer base across RFM segments. High-value strategic view.

  Route: /segments

  Data Sources: GET /segments (one call, returns all 6 segments)

  Page Layout:
  PageHeader: "Customer Segments"
  Subtext: "RFM-based audience intelligence"

  Row 1 — Distribution Overview (two columns):
    Left (50%): DonutChart — count per segment (colored by segment)
                Center: "1,247 total customers"

    Right (50%): Segment Stats Table
      Columns: Segment | Customers | % of Total | Avg Spend | Avg Orders | Avg Days Dormant
      Rows: one per segment, colored segment badge in first column

  Row 2 — Segment Cards Grid (2 or 3 columns):
    One card per segment:
    ┌──────────────────────────────┐
    │ [Colored dot] CHAMPIONS       │
    │ ─────────────────────────── │
    │ 312 customers  (25.0%)        │
    │ Avg Spend: ₹8,200             │
    │ Avg Orders: 7.2               │
    │ Last Active: 12 days avg      │
    │                              │
    │ [Explore Customers →]         │
    └──────────────────────────────┘

  Row 3 — Segment Comparison Chart:
    SegmentBarChart: horizontal bars sorted by avgSpend descending
    Toggle: show avgSpend | avgOrderFrequency | count

  Components: DonutChart, SegmentStatsTable, SegmentCard, SegmentBarChart, RfmSegmentBadge

  User Actions:
  - Click "Explore Customers →" on any segment card → /segments/[segmentName]
  - Click segment in DonutChart → navigates to segment detail

  ---
  24b. Segment Detail (/segments/[segmentName])

  Purpose: Deep-dive into a specific RFM segment. View all customers, aggregate stats, and launch a campaign targeting this segment.

  Route: /segments/[segmentName]

  Data Sources:
  - GET /segments (for this segment's aggregate stats, filtered client-side)
  - GET /segments/:segmentName/customers (cursor pagination)

  Page Layout:
  PageHeader: "CHAMPIONS"          [← Back to Segments]
              "Your highest-value, most active customers"

  Row 1 — Segment Stats (4 metric cards):
    Customer Count | Avg Spend | Avg Order Frequency | Avg Days Since Last Order

  Row 2 — Campaign Suggestion:
    ┌──────────────────────────────────────────────────────┐
    │  💡 Create a campaign for this segment                │
    │  "CHAMPIONS respond well to early access and VIP      │
    │   loyalty rewards."                                   │
    │                          [Create Campaign →]          │
    └──────────────────────────────────────────────────────┘
    (Links to /campaigns/new — Zustand wizard store is initialized with segment context)

  Row 3 — Customer List:
    Table columns: Name | Phone | Total Spend | Total Orders | Last Order | R/F/M | Actions
    Load More pagination

  Components: MetricCard, RfmSegmentBadge, DataTable, CursorPagination, campaign suggestion panel

  ---
  25. Import Pages

  25a. Import Center (/import)

  Purpose: Upload customer or order CSV files. Monitor import progress and history.

  Route: /import

  Data Sources: GET /import (list of recent jobs, cursor pagination)

  Page Layout:
  PageHeader: "Data Import"

  Upload Zone:
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │             ↑  Drag & drop your CSV here                │
  │                    or click to browse                    │
  │                                                          │
  │       ○ Customer CSV    ● Order CSV                      │
  │                                                          │
  │   Max 10 MB  |  Accepted: .csv only                     │
  └──────────────────────────────────────────────────────────┘

  Upload button: [Upload CSV]  (disabled until file selected + type chosen)

  Import History:
  Table columns: Filename | Type | Status | Total Rows | Imported | Skipped | Failed | Uploaded At

  Row actions: [View Details →] → /import/[jobId]
  Each PROCESSING row auto-refreshes (polling)

  Components: CsvUploadZone, DataTable, StatusBadge, SkeletonTable, CursorPagination

  User Actions:
  - Drag/drop or select file
  - Choose type (customers/orders)
  - Upload → mutation fires, navigates to /import/[jobId]
  - Click row → /import/[jobId]

  ---
  25b. Import Job Detail (/import/[jobId])

  Purpose: Monitor a running import or review results of a completed one.

  Route: /import/[jobId]

  Data Sources: GET /import/:jobId (polled every 3s if status is PROCESSING)

  Page Layout:
  PageHeader: [filename]            [StatusBadge: PROCESSING/COMPLETED/FAILED]

  Progress Panel (visible while PROCESSING or COMPLETED):
    ┌──────────────────────────────────────────────────────┐
    │  [████████████████░░░░░░░░]  68%                     │
    │  847 / 1,247 rows processed                          │
    └──────────────────────────────────────────────────────┘

  Results Grid (4 metric cards):
    Total Rows | Imported ✓ | Skipped ⚠ | Failed ✗

  RFM Recompute Status (if customers CSV):
    "RFM scores are being recomputed..."  |  "RFM scores updated successfully."

  Error Log (only if failed > 0):
    Collapsible table: Row # | Error Message
    (Shows up to 50 errors as returned by backend)
    If failed > 50: "Showing first 50 errors. Fix and re-import."

  [← Back to Import]

  Components: Progress (shadcn), MetricCard, StatusBadge, error log table, SkeletonCards

  ---
  26. Empty States

  Every list, table, and chart has a specific empty state. Empty states are never just blank white space.

  ┌───────────────────────┬───────────────┬────────────────────────┬─────────────────────────────────────────────────┬─────────────────────────┐
  │        Context        │     Icon      │        Heading         │                   Description                   │           CTA           │
  ├───────────────────────┼───────────────┼────────────────────────┼─────────────────────────────────────────────────┼─────────────────────────┤
  │ No campaigns          │ Megaphone     │ "No campaigns yet"     │ "Create your first AI-powered campaign in       │ "New Campaign" →        │
  │                       │               │                        │ minutes."                                       │ /campaigns/new          │
  ├───────────────────────┼───────────────┼────────────────────────┼─────────────────────────────────────────────────┼─────────────────────────┤
  │ No customers          │ Users         │ "No customers yet"     │ "Import your customer list to get started."     │ "Import CSV" → /import  │
  ├───────────────────────┼───────────────┼────────────────────────┼─────────────────────────────────────────────────┼─────────────────────────┤
  │ No orders             │ ShoppingBag   │ "No orders found"      │ "Try adjusting your filters, or import order    │ "Import CSV"            │
  │                       │               │                        │ data."                                          │                         │
  ├───────────────────────┼───────────────┼────────────────────────┼─────────────────────────────────────────────────┼─────────────────────────┤
  │ No segments           │ PieChart      │ "No segments           │ "Segments are computed after customer data is   │ —                       │
  │                       │               │ available"             │ imported and RFM analysis runs."                │                         │
  ├───────────────────────┼───────────────┼────────────────────────┼─────────────────────────────────────────────────┼─────────────────────────┤
  │ No messages           │ MessageSquare │ "No messages           │ "This campaign hasn't been launched yet."       │ "Go to Campaign"        │
  │ (campaign)            │               │ dispatched"            │                                                 │                         │
  ├───────────────────────┼───────────────┼────────────────────────┼─────────────────────────────────────────────────┼─────────────────────────┤
  │ No import jobs        │ Upload        │ "No imports yet"       │ "Upload a CSV to add customers or orders."      │ "Upload CSV"            │
  ├───────────────────────┼───────────────┼────────────────────────┼─────────────────────────────────────────────────┼─────────────────────────┤
  │ No communications     │ Activity      │ "No communication      │ "This customer hasn't been reached by any       │ —                       │
  │ (customer)            │               │ history"               │ campaign."                                      │                         │
  ├───────────────────────┼───────────────┼────────────────────────┼─────────────────────────────────────────────────┼─────────────────────────┤
  │ No orders (customer)  │ ShoppingBag   │ "No orders on record"  │ —                                               │ —                       │
  ├───────────────────────┼───────────────┼────────────────────────┼─────────────────────────────────────────────────┼─────────────────────────┤
  │ Filtered with no      │ Search        │ "No results match your │ "Try clearing some filters."                    │ "Clear filters"         │
  │ results               │               │  filters"              │                                                 │                         │
  └───────────────────────┴───────────────┴────────────────────────┴─────────────────────────────────────────────────┴─────────────────────────┘

  ---
  27. Error States

  ┌─────────────────────────────┬───────────────────────────────────┬────────────────────────────────────────────┐
  │           Context           │            Error Type             │              Recovery Action               │
  ├─────────────────────────────┼───────────────────────────────────┼────────────────────────────────────────────┤
  │ Dashboard fails to load     │ ErrorState with retry             │ "Retry" button → re-run all queries        │
  ├─────────────────────────────┼───────────────────────────────────┼────────────────────────────────────────────┤
  │ Campaign list fails         │ ErrorState with retry             │ Retry individual query                     │
  ├─────────────────────────────┼───────────────────────────────────┼────────────────────────────────────────────┤
  │ AI intent extraction fails  │ Inline error below goal input     │ Retry button; keep goal text intact        │
  ├─────────────────────────────┼───────────────────────────────────┼────────────────────────────────────────────┤
  │ AI generate-campaign fails  │ Step 3 overlay error              │ "Try Again" returns to step 2              │
  ├─────────────────────────────┼───────────────────────────────────┼────────────────────────────────────────────┤
  │ Launch campaign fails       │ Toast (with error.message)        │ Re-enable launch button                    │
  ├─────────────────────────────┼───────────────────────────────────┼────────────────────────────────────────────┤
  │ Wrong campaign status (422) │ Toast with specific message       │ "This campaign has already been launched." │
  ├─────────────────────────────┼───────────────────────────────────┼────────────────────────────────────────────┤
  │ Session expired (401)       │ Redirect to /login?from=<current> │ Login again                                │
  ├─────────────────────────────┼───────────────────────────────────┼────────────────────────────────────────────┤
  │ CSV upload too large        │ Pre-upload validation             │ File size check client-side before upload  │
  ├─────────────────────────────┼───────────────────────────────────┼────────────────────────────────────────────┤
  │ CSV parse errors            │ Error log in job detail           │ Shown in the import job detail page        │
  ├─────────────────────────────┼───────────────────────────────────┼────────────────────────────────────────────┤
  │ Network unreachable         │ Full-page ErrorState              │ "Check connection, then retry"             │
  └─────────────────────────────┴───────────────────────────────────┴────────────────────────────────────────────┘

  ---
  28. Mobile Responsiveness Strategy

  Breakpoints (Tailwind defaults):
  - sm: 640px — small mobile landscape
  - md: 768px — tablet
  - lg: 1024px — small desktop
  - xl: 1280px — standard desktop

  Sidebar Behavior:
  - xl+: Always visible, full width (240px)
  - lg–xl: Collapsed to icon-only (64px), hover expands
  - < lg: Drawer overlay (triggered by hamburger in TopBar), default closed

  Grid Adaptations:
  - Dashboard 4-col KPI row → 2-col on md, 1-col on sm
  - Dashboard 2-col charts → 1-col stacked on md
  - Segment cards grid → 2-col on md, 1-col on sm

  Table Adaptations:
  - On sm: tables switch to card-list layout where each row becomes a card
  - Column visibility toggle shows fewer columns by default at smaller breakpoints
  - Horizontal scroll with overflow-x-auto as fallback for critical tables

  Wizard Adaptations:
  - Step indicator: abbreviated labels on sm, icon-only on very small
  - Step content: full-width single-column layout

  Charts:
  - Minimum render width: min-w-0 with ResponsiveContainer (Recharts native)
  - Donut chart hides legend on sm, shows tooltip on hover only
  - Funnel chart switches to vertical orientation on sm

  ---
  29. Accessibility Strategy

  Standards Target: WCAG 2.1 AA

  Focus Management:
  - All interactive elements reachable by keyboard (Tab order follows DOM order)
  - Modal dialogs trap focus and restore to trigger on close
  - focus-visible rings (indigo-500, 2px offset) on all focusable elements
  - Skip-to-main-content link as first focusable element in layout

  ARIA:
  - Icon-only buttons: aria-label required on every instance
  - Status badges: role="status" or aria-label describing the status
  - Live region for toast notifications: role="status" on toast container
  - Loading states: aria-busy="true" on data regions while fetching
  - Tables: proper <caption>, <thead>, <th scope> for screen reader navigation
  - Dialogs: role="dialog", aria-labelledby, aria-describedby

  Color:
  - All status colors pass 4.5:1 contrast ratio on their respective backgrounds
  - Never use color alone to convey information (always pair with icon or text)
  - Dark mode: not in v1 scope; design tokens structured to enable it later via CSS variables

  Forms:
  - All inputs have associated <label> elements (not placeholder-only)
  - Error messages linked via aria-describedby
  - Required fields marked visually and with aria-required

  Motion:
  - All animations wrapped with prefers-reduced-motion: reduce check via Tailwind's motion-reduce: prefix
  - Loading animations (skeletons, spinners) disabled or made static under reduced motion preference

  ---
  30. Performance Optimization Strategy

  Bundle:
  - Recharts: dynamic import (next/dynamic) on all chart components — prevents chart library from entering the initial JS bundle
  - TanStack Virtual: code-split, only loaded on pages with large lists
  - Wizard steps: each step component is dynamically imported — reduces TTI for non-wizard pages

  Data:
  - TanStack Query staleTime and gcTime tuned (see Section 7) to minimize redundant API calls
  - Dashboard queries run in parallel (not serial) — total wait time = slowest query, not sum
  - Segment data (5-minute stale) shared between dashboard and segments page via same query key
  - useInfiniteQuery loads pages on demand — no upfront cost for large datasets

  Images:
  - next/image for any asset (logo, empty state illustrations)
  - SVG icons inline (lucide-react tree-shakes to only used icons)

  CSS:
  - Tailwind CSS purges unused utilities at build time — typical output < 15KB gzipped
  - cn() utility (clsx + tailwind-merge) prevents specificity conflicts without runtime CSS-in-JS overhead

  React:
  - memo applied to CampaignCard, SegmentCard, ClusterCard — prevent re-renders in list virtualization
  - useCallback / useMemo for stable references passed to TanStack Table column definitions
  - Avoid prop drilling deeper than 2 levels — use composition or Zustand

  Next.js:
  - generateMetadata for page title SEO
  - React Server Components for static layout chrome (sidebar nav links are RSC — zero JS cost)
  - Incremental Static Regeneration not applicable (all data is real-time, auth-gated)
  - Route prefetching: <Link prefetch> on sidebar nav items — subsequent nav is instant

  ---
  31. Deployment Strategy

  Platform: Vercel (zero-config, Next.js-native)

  Environment Variable Configuration:

  ┌────────────────┬─────────────┬────────────────────────────────────────────────────────────────┐
  │    Variable    │    Scope    │                          Description                           │
  ├────────────────┼─────────────┼────────────────────────────────────────────────────────────────┤
  │ CRM_API_URL    │ Server-only │ Backend base URL (e.g., https://xeno-crm-backend.onrender.com) │
  ├────────────────┼─────────────┼────────────────────────────────────────────────────────────────┤
  │ CRM_API_SECRET │ Server-only │ API_SECRET_TOKEN from backend                                  │
  ├────────────────┼─────────────┼────────────────────────────────────────────────────────────────┤
  │ SESSION_SECRET │ Server-only │ 64-char random hex for iron-session encryption                 │
  ├────────────────┼─────────────┼────────────────────────────────────────────────────────────────┤
  │ ADMIN_PASSWORD │ Server-only │ Frontend login password                                        │
  └────────────────┴─────────────┴────────────────────────────────────────────────────────────────┘

  No NEXT_PUBLIC_ variables required — all sensitive values are server-side only.

  Deployment Pipeline:
  git push → Vercel CI
    → Install dependencies
    → TypeScript type-check (tsc --noEmit)
    → ESLint
    → next build (production optimization)
    → Deploy to Vercel Edge Network
    → Preview deployment per PR
    → Production deployment on main merge

  Environments:
  - production branch → xeno-crm.vercel.app (or custom domain)
  - PR branches → xeno-crm-pr-123.vercel.app (preview with its own env vars)

  Health Monitoring:
  - Vercel Analytics enabled (Core Web Vitals, LCP, FID, CLS)
  - The /api/proxy/health route maps to the backend health check — can be pinged by uptime monitors

  CORS:
  The backend's FRONTEND_URL env var must be set to the Vercel deployment URL. The BFF proxy pattern means the frontend itself makes no
  CORS-restricted calls — all backend requests go through the Next.js API routes which are same-origin from the browser's perspective. The backend
  only needs to accept requests from the Vercel server IP, not the user's browser.

  ---
  Summary of Pages by Route

  ┌──────────────────────────┬──────────────┬──────────────────────────────────────────────────────┬────────────────────┬───────────────────────┐
  │          Route           │   Purpose    │                  Primary API Calls                   │     Key Charts     │      Key Tables       │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │ /login                   │ Auth gate    │ POST /api/auth/login                                 │ —                  │ —                     │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │ /dashboard               │ KPI overview │ GET /segments, GET /campaigns×3, GET /import         │ DonutChart,        │ Recent campaigns (5   │
  │                          │              │                                                      │ SegmentBarChart    │ rows)                 │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │ /campaigns               │ Campaign hub │ GET /campaigns?status=X                              │ —                  │ Campaign cards        │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │                          │              │ POST /ai/intent-extract → /ai/audience-preview →     │ ChannelMixBar      │                       │
  │ /campaigns/new           │ AI wizard    │ /ai/generate-campaign → /ai/refine-campaign → POST   │ (step 2)           │ —                     │
  │                          │              │ /ready → POST /launch                                │                    │                       │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │ /campaigns/[id]          │ Campaign     │ GET /campaigns/:id, GET /campaigns/:id/stats         │ FunnelChart,       │ Cluster breakdown     │
  │                          │ detail       │                                                      │ DonutChart         │                       │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │ /campaigns/[id]/messages │ Message      │ GET /campaigns/:id/messages                          │ —                  │ Messages table        │
  │                          │ audit log    │                                                      │                    │ (paginated)           │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │ /customers               │ Customer     │ GET /customers                                       │ —                  │ Customers table       │
  │                          │ list         │                                                      │                    │                       │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │                          │              │ GET /customers/:id, GET                              │                    │ Orders mini-table,    │
  │ /customers/[id]          │ Customer 360 │ /customers/:id/communications, GET                   │ —                  │ Communications        │
  │                          │              │ /orders?customerId                                   │                    │ timeline              │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │ /orders                  │ Order log    │ GET /orders                                          │ —                  │ Orders table          │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │ /segments                │ Segment      │ GET /segments                                        │ DonutChart,        │ Segment stats table   │
  │                          │ analytics    │                                                      │ SegmentBarChart    │                       │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │ /segments/[name]         │ Segment      │ GET /segments, GET /segments/:name/customers         │ —                  │ Customers in segment  │
  │                          │ drill-down   │                                                      │                    │                       │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │ /import                  │ Data         │ GET /import, POST /import                            │ —                  │ Import jobs table     │
  │                          │ ingestion    │                                                      │                    │                       │
  ├──────────────────────────┼──────────────┼──────────────────────────────────────────────────────┼────────────────────┼───────────────────────┤
  │ /import/[jobId]          │ Job monitor  │ GET /import/:jobId (polled)                          │ Progress bar       │ Error log table       │
  └──────────────────────────┴──────────────┴──────────────────────────────────────────────────────┴────────────────────┴───────────────────────┘

  ---
  This document is the complete specification. Every architectural decision is derived from the actual backend capabilities, no features have been
  invented, and every referenced API endpoint, model field, and status value exists in the codebase as verified above.
