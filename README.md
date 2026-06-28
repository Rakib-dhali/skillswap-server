# SkillSwap — Server API

> A secure, high-performance RESTful API powering the SkillSwap freelance marketplace. Built with **Express 5**, **MongoDB**, and **JWT verification** via JWKS — handling tasks, proposals, payments, user management, and real-time analytics.

[![Express](https://img.shields.io/badge/Express-5-000?logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb)](https://www.mongodb.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](https://nodejs.org/)
[![JWT](https://img.shields.io/badge/Auth-JWT_via_JWKS-000?logo=jsonwebtokens)](https://jwt.io/)
[![Vercel](https://img.shields.io/badge/Deployed-Vercel-000?logo=vercel)](https://vercel.com/)

---

## 🌐 Live API

| Endpoint | URL |
|---|---|
| **Server (API)** | [skillswap-server-a10.vercel.app](https://skillswap-server-a10.vercel.app/) |
| **Client (Frontend)** | [skillswap-client-a10.vercel.app](https://skillswap-client-a10.vercel.app/) |

---

## ✨ Key Features

### 🔐 Security & Authentication
- **JWKS-based JWT Verification** — Tokens are verified against the client's published JWKS endpoint using the `jose` library, ensuring zero shared secrets between client and server
- **Role-Based Middleware** — Layered middleware stack (`verifyToken` → `verifyAdmin` / `verifyClient` / `verifyFreelancer`) enforces access control per endpoint
- **CORS Configuration** — Strict origin allowlisting for cross-origin requests

### 📋 Task Management API
- **CRUD Operations** — Create, read, update, and delete tasks
- **Advanced Filtering** — Search by title/description, filter by category and minimum budget
- **Server-Side Pagination** — Configurable page size with metadata (total items, total pages, current page)
- **Sorting** — By newest, highest budget, or lowest budget
- **Status Workflow** — Tasks flow through `open` → `in progress` → `completed`
- **Featured Tasks** — Randomized sampling via MongoDB `$sample` aggregation

### 📝 Proposal System
- **Duplicate Prevention** — One proposal per freelancer per task, enforced at the database level
- **Enriched Responses** — Proposals are automatically enriched with task title, budget, and category
- **Status Management** — Accept/reject proposals with automatic task status updates
- **Client-Centric View** — Fetch all proposals received across all of a client's tasks

### 💰 Payment Processing
- **Payment Recording** — Store completed Stripe transactions with full metadata
- **Earnings Tracking** — Freelancer-specific payment history enriched with task details
- **Revenue Analytics** — Aggregated platform revenue from completed payments

### 📊 Analytics & Dashboards
- **Admin Overview** — Real-time platform KPIs: total users, tasks, active projects, revenue
- **Activity Feed** — Unified timeline merging tasks, payments, proposals, and user registrations sorted chronologically
- **Client Stats** — Per-user metrics: total tasks, open/in-progress counts, total spend
- **Freelancer Stats** — Proposal counts (total, pending, accepted) and cumulative earnings

### 👥 User & Profile Management
- **Freelancer Directory** — Public listing of all freelancers
- **Profile Updates** — Freelancers can update name, avatar, skills, bio, and hourly rate
- **Deliverable Submission** — Freelancers submit work URLs directly through the API

---

## 🛣️ API Endpoints

### Public Endpoints

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/tasks` | Browse tasks with search, filter, sort, and pagination |
| `GET` | `/api/tasks/:id` | Get a single task by ID |
| `GET` | `/api/featured-task` | Get 6 random featured tasks |
| `GET` | `/api/freelancers` | List all freelancers |
| `GET` | `/api/freelancers/:id` | Get freelancer profile by ID |
| `GET` | `/api/statistics` | Platform-wide stats (users, tasks, revenue) |
| `GET` | `/api/freelancer/stats/:email` | Freelancer statistics |
| `GET` | `/api/freelancer/activity/:email` | Freelancer activity feed |

### Protected — Client Endpoints

| Method | Route | Middleware | Description |
|---|---|---|---|
| `POST` | `/api/tasks` | `verifyToken`, `verifyClient` | Create a new task |
| `GET` | `/api/tasks/client/:email` | `verifyToken`, `verifyClient` | Get all tasks posted by client |
| `GET` | `/api/proposals/client/:email` | `verifyToken`, `verifyClient` | Get proposals on client's tasks |
| `PATCH` | `/api/proposals/:id/status` | `verifyToken`, `verifyClient` | Accept or reject a proposal |
| `POST` | `/api/payments` | `verifyToken`, `verifyClient` | Record a completed payment |
| `GET` | `/api/client/stats/:email` | `verifyToken`, `verifyClient` | Client dashboard statistics |

### Protected — Freelancer Endpoints

| Method | Route | Middleware | Description |
|---|---|---|---|
| `POST` | `/api/proposals` | `verifyToken`, `verifyFreelancer` | Submit a proposal |
| `GET` | `/api/proposals/freelancer/:email` | `verifyToken`, `verifyFreelancer` | Get freelancer's proposals |
| `GET` | `/api/freelancers/profile/:email` | `verifyToken`, `verifyFreelancer` | Get own profile |
| `PATCH` | `/api/freelancers/profile/:email` | `verifyToken`, `verifyFreelancer` | Update profile |
| `PATCH` | `/api/tasks/:id/deliverable` | `verifyToken`, `verifyFreelancer` | Submit deliverable URL |
| `GET` | `/api/earnings/freelancer/:email` | `verifyToken`, `verifyFreelancer` | Get earnings history |
| `GET` | `/api/freelancer/active-projects/:email` | `verifyToken`, `verifyFreelancer` | Get active/accepted projects |

### Protected — Admin Endpoints

| Method | Route | Middleware | Description |
|---|---|---|---|
| `GET` | `/api/admin/overview` | `verifyToken`, `verifyAdmin` | Platform KPI summary |
| `GET` | `/api/admin/activity` | `verifyToken`, `verifyAdmin` | Aggregated activity feed |
| `GET` | `/api/admin/tasks` | `verifyToken`, `verifyAdmin` | All tasks (admin view) |
| `PATCH` | `/api/tasks/:id/status` | `verifyToken`, `verifyAdmin` | Update task status |
| `DELETE` | `/api/tasks/:id` | `verifyToken` | Delete a task (with safeguards) |
| `PUT` | `/api/tasks/:id` | `verifyToken` | Update task description |
| `GET` | `/api/payments` | `verifyToken` | All payment transactions |

---

## 🏗️ Architecture

```
skillswap-server/
├── index.js              # Single-file Express server with all routes and middleware
├── package.json          # Dependencies and scripts
├── vercel.json           # Vercel serverless deployment configuration
├── .env                  # Environment variables (not committed)
└── .gitignore
```

### Middleware Stack

```
Request
  │
  ├── express.json()          →  Parse JSON body
  ├── cors()                  →  Validate origin
  │
  ├── verifyToken             →  Decode & verify JWT via JWKS
  │     │
  │     ├── verifyAdmin       →  Enforce admin role
  │     ├── verifyClient      →  Enforce client role
  │     └── verifyFreelancer  →  Enforce freelancer role
  │
  └── Route Handler           →  Business logic + MongoDB operations
```

### Security Flow

```
Client App (Next.js)
  │
  │  POST /api/auth/sign-in
  │  ──────────────────────►  Better Auth (in Next.js)
  │                               │
  │  ◄── JWT Token ───────────────┘
  │
  │  GET /api/tasks (Authorization: Bearer <JWT>)
  │  ──────────────────────►  Express Server
  │                               │
  │                          verifyToken middleware
  │                               │
  │                          Fetch JWKS from Client /api/auth/jwks
  │                               │
  │                          Verify JWT signature
  │                               │
  │                          Extract user payload (email, role)
  │                               │
  │  ◄── Response ────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Runtime** | Node.js 18+ | JavaScript server runtime |
| **Framework** | Express 5 | HTTP routing and middleware |
| **Database** | MongoDB Atlas (native driver 7.x) | Document storage and aggregation |
| **Auth Verification** | jose 6.x | JWKS-based JWT signature verification |
| **CORS** | cors | Cross-origin request handling |
| **Environment** | dotenv | Secure configuration management |
| **Dev Tooling** | nodemon | Hot-reload during development |
| **Deployment** | Vercel (Serverless) | Edge-optimized API hosting |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** ≥ 18.x
- **MongoDB Atlas** cluster (or local MongoDB instance)
- The **SkillSwap Client** app running (for JWKS token verification)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/skillswap-server.git
cd skillswap-server

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
```

### Environment Variables

Create a `.env` file:

```env
MONGODB_URI=your_mongodb_connection_string
CLIENT_URL=http://localhost:3000
```

### Run Development Server

```bash
npm run dev
```

Server starts on [http://localhost:5000](http://localhost:5000).

---

## 📦 NPM Packages

| Package | Version | Purpose |
|---|---|---|
| `express` | ^5.2.1 | Web framework (latest major version) |
| `mongodb` | ^7.3.0 | Native MongoDB driver |
| `jose` | ^6.2.3 | JWT verification via remote JWKS |
| `cors` | ^2.8.6 | Cross-Origin Resource Sharing |
| `dotenv` | ^17.4.2 | Environment variable management |
| `cookie-parser` | ^1.4.7 | Cookie parsing middleware |
| `nodemon` | ^3.1.14 | Development auto-restart (devDependency) |

---

## 🔑 Design Decisions

1. **JWKS over Shared Secrets** — The server never stores auth secrets. It fetches the client's public JWKS and verifies tokens cryptographically, enabling true service decoupling.

2. **Single-File Architecture** — All routes live in `index.js` for simplicity and deployment ease on Vercel's serverless platform. For larger teams, this can be refactored into a modular router structure.

3. **Express 5** — Using the latest major version of Express for improved async error handling and modern middleware patterns.

4. **Data Enrichment at API Level** — Proposals and earnings responses are enriched with related task details server-side, reducing client round-trips and keeping frontend logic lean.

5. **Safeguarded Deletions** — Tasks with accepted proposals cannot be deleted, preventing data integrity issues mid-workflow.

---

## 📄 License

This project is built as a portfolio project. Feel free to reference the architecture and patterns.

---

<p align="center">
  <strong>Built with precision by a full-stack developer who believes great software is invisible.</strong>
</p>
