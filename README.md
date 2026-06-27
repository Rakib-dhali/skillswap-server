# SkillSwap - Server

## Purpose
This is the backend server for SkillSwap, a robust freelance marketplace platform. It provides a secure and scalable RESTful API built with Express and Node.js. The server manages all database operations, secure token verification, and data processing required to support tasks, proposals, payments, user statistics, and the administrative overview.

## Live Website Link
- **Server Application:** [https://skillswap-server-a10.vercel.app/](https://skillswap-server-a10.vercel.app/)
*(The companion client application is deployed at: https://skillswap-client-a10.vercel.app/)*

## Key Features
- **RESTful API:** Comprehensive endpoints for managing tasks, users, proposals, and payments.
- **MongoDB Integration:** Direct and efficient database operations using the native MongoDB driver.
- **Secure Request Handling:** JWT verification using `jose` to ensure only authenticated users can access protected routes.
- **Role Verification Middleware:** Middleware functions to restrict access based on user roles (Admin, Client, Freelancer).
- **Statistics & Activity Feeds:** Specialized aggregation pipelines to serve analytical data for dashboards.

## NPM Packages Used
- `express` - Fast, unopinionated, minimalist web framework for Node.js.
- `mongodb` - Official MongoDB driver for robust database operations.
- `jose` - Used for verifying JSON Web Tokens (JWTs) securely across services.
- `cors` - Middleware to enable Cross-Origin Resource Sharing.
- `dotenv` - Module to load environment variables from a `.env` file securely.
- `cookie-parser` - Parse Cookie header and populate `req.cookies`.
