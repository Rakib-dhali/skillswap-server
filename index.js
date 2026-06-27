import dns from "node:dns";
dns.setServers(["1.1.1.1", "1.0.0.1"]);

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";
dotenv.config();

const app = express();

app.use(express.json());
app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL],
  }),
);
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(401).json({ msg: "Token not sent" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ msg: "Token not found" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log("payload", payload);
    req.user = payload;

    next();
  } catch (error) {
    console.log(error);
    return res.status(403).json({ msg: "Invalid Token" });
  }
};

const verifyFreelancer = (req, res, next) => {
  if (req.user.role !== "freelancer") {
    return res
      .status(403)
      .json({ msg: "You are not authorized to perform this action" });
  }
  next();
};

const verifyClient = (req, res, next) => {
  if (req.user.role !== "client") {
    return res
      .status(403)
      .json({ msg: "You are not authorized to perform this action" });
  }
  next();
};

const verifyAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ msg: "You are not authorized to perform this action" });
  }
  next();
};

async function run() {
  try {
    // await client.connect();
    const db = client.db("skillswap");
    const userCollection = db.collection("user");
    const taskCollection = db.collection("tasks");
    const proposalCollection = db.collection("proposals");
    const paymentCollection = db.collection("payments");

    app.get("/api/freelancers", async (req, res) => {
      const query = { role: "freelancer" };
      const freelancers = await userCollection.find(query).toArray();
      res.send(freelancers);
    });

    app.get("/api/statistics", async (req, res) => {
      try {
        const [totalTasks, totalUsers, payments] = await Promise.all([
          taskCollection.countDocuments({}),
          userCollection.countDocuments({}),
          paymentCollection.find({ payment_status: "complete" }).toArray(),
        ]);

        const totalRevenue = payments.reduce(
          (sum, payment) => sum + (Number(payment.amount) || 0),
          0,
        );

        res.json({
          totalUsers,
          totalTasks,
          totalRevenue,
        });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to load statistics." });
      }
    });

    app.get("/api/freelancers/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const freelancer = await userCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!freelancer) {
          return res.status(404).json({ error: "Freelancer not found" });
        }
        res.send(freelancer);
      } catch (error) {
        console.error("Backend Error:", error);
        return res
          .status(500)
          .json({ error: "Failed to query the database matrix directory." });
      }
    });
    app.get("/api/tasks", async (req, res) => {
      try {
        const { search, category, minBudget, sortBy, page } = req.query;

        // 1. Build Dynamic Filter Object
        let query = {};

        // Text Search across title OR description
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ];
        }

        // Category Filter (Ignore if "All" or "All Categories")
        if (category && category !== "All" && category !== "All Categories") {
          query.category = category;
        }

        // Minimum Budget Filter
        if (minBudget) {
          query.budget = { $gte: parseFloat(minBudget) };
        }

        // 2. Build Sorting Configuration
        let sortOptions = {};
        if (sortBy === "highest-budget") {
          sortOptions.budget = -1;
        } else if (sortBy === "lowest-budget") {
          sortOptions.budget = 1;
        } else {
          // Default: Newest task first
          sortOptions.createdAt = -1;
        }

        // 3. Pagination Setup
        const itemsPerPage = 6;
        const currentPage = parseInt(page) || 1;
        const skipValue = (currentPage - 1) * itemsPerPage;

        // 4. Database Queries (Executed in parallel for performance)
        const [tasks, totalTasks] = await Promise.all([
          taskCollection
            .find(query)
            .sort(sortOptions)
            .skip(skipValue)
            .limit(itemsPerPage)
            .toArray(),
          taskCollection.countDocuments(query),
        ]);

        // 5. Send back structured metadata along with data rows
        res.json({
          tasks,
          pagination: {
            totalItems: totalTasks,
            totalPages: Math.ceil(totalTasks / itemsPerPage),
            currentPage,
            itemsPerPage,
          },
        });
      } catch (error) {
        console.error("Backend Error:", error);
        res
          .status(500)
          .json({ error: "Failed to query the database matrix directory." });
      }
    });
    app.get("/api/featured-task", async (req, res) => {
      try {
        const featuredTasks = await taskCollection
          .aggregate([{ $sample: { size: 6 } }])
          .toArray();
        res.json(featuredTasks);
      } catch (error) {
        console.error("Backend Error:", error);
        res
          .status(500)
          .json({ error: "Failed to query the database matrix directory." });
      }
    });
    app.get("/api/admin/tasks", async (req, res) => {
      try {
        const tasks = await taskCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.json(
          tasks.map((task) => ({
            ...task,
            _id: String(task._id),
          })),
        );
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to retrieve all tasks." });
      }
    });

    app.get("/api/payments", async (req, res) => {
      try {
        const payments = await paymentCollection
          .find({})
          .sort({ paid_at: -1 })
          .toArray();
        res.json(
          payments.map((payment) => ({
            ...payment,
            _id: String(payment._id),
          })),
        );
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to retrieve payments." });
      }
    });

    app.get("/api/admin/overview", async (req, res) => {
      try {
        const [totalUsers, totalTasks, activeTasks, payments] =
          await Promise.all([
            userCollection.countDocuments({}),
            taskCollection.countDocuments({}),
            taskCollection.countDocuments({
              status: { $in: ["open", "in progress", "In Progress"] },
            }),
            paymentCollection.find({ payment_status: "complete" }).toArray(),
          ]);

        const totalRevenue = payments.reduce(
          (sum, payment) => sum + (Number(payment.amount) || 0),
          0,
        );

        res.json({
          totalUsers,
          totalTasks,
          activeTasks,
          totalRevenue,
        });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to load admin overview." });
      }
    });

    app.get("/api/admin/activity", async (req, res) => {
      try {
        const [tasks, payments, proposals, users] = await Promise.all([
          taskCollection
            .find(
              {},
              {
                projection: {
                  title: 1,
                  client_email: 1,
                  budget: 1,
                  createdAt: 1,
                },
              },
            )
            .sort({ createdAt: -1 })
            .limit(5)
            .toArray(),
          paymentCollection
            .find(
              { payment_status: "complete" },
              { projection: { task_id: 1, amount: 1, paid_at: 1 } },
            )
            .sort({ paid_at: -1 })
            .limit(5)
            .toArray(),
          proposalCollection
            .find(
              {},
              {
                projection: {
                  task_id: 1,
                  freelancer_name: 1,
                  proposed_budget: 1,
                  submitted_at: 1,
                  status: 1,
                },
              },
            )
            .sort({ submitted_at: -1 })
            .limit(5)
            .toArray(),
          userCollection
            .find(
              {},
              { projection: { name: 1, email: 1, role: 1, createdAt: 1 } },
            )
            .sort({ createdAt: -1 })
            .limit(5)
            .toArray(),
        ]);

        const events = [];

        tasks.forEach((task) => {
          events.push({
            id: `task-${task._id}`,
            type: "task_created",
            title: `New Task Created: ${task.title}`,
            detail: `Client: ${task.client_email || "Unknown"} — Amount: $${task.budget ?? 0}`,
            timestamp: task.createdAt
              ? new Date(task.createdAt).toISOString()
              : new Date().toISOString(),
          });
        });

        payments.forEach((payment) => {
          events.push({
            id: `payment-${payment._id}`,
            type: "payment_processed",
            title: `Payment Processed: $${payment.amount ?? 0}`,
            detail: `Task ID: ${payment.task_id || "unknown"}`,
            timestamp: payment.paid_at
              ? new Date(payment.paid_at).toISOString()
              : new Date().toISOString(),
          });
        });

        proposals.forEach((proposal) => {
          events.push({
            id: `proposal-${proposal._id}`,
            type: "proposal_submitted",
            title: `Proposal Submitted by ${proposal.freelancer_name || "Unknown"}`,
            detail: `Task ID: ${proposal.task_id || "unknown"} — Amount: $${proposal.proposed_budget ?? 0}`,
            timestamp: proposal.submitted_at
              ? new Date(proposal.submitted_at).toISOString()
              : new Date().toISOString(),
          });
        });

        users.forEach((user) => {
          events.push({
            id: `user-${user._id}`,
            type: "user_registered",
            title: `New User Registration: ${user.name || user.email || "Unknown"}`,
            detail: `Role: ${user.role || "client"}`,
            timestamp: user.createdAt
              ? new Date(user.createdAt).toISOString()
              : new Date(new ObjectId(user._id).getTimestamp()).toISOString(),
          });
        });

        events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(events.slice(0, 6));
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to load admin activity feed." });
      }
    });

    app.post("/api/tasks", verifyToken, verifyClient, async (req, res) => {
      try {
        const {
          title,
          category,
          budget,
          description,
          deadline,
          client_email,
          client_name,
        } = req.body;

        if (!title || !category || !budget || !description) {
          return res
            .status(400)
            .json({ error: "Missing required task fields." });
        }

        const newTask = {
          title,
          category,
          budget: parseFloat(budget),
          description,
          deadline: deadline || null,
          client_email,
          client: {
            name: client_name || "Independent Client",
            location: "International",
            tasksPosted: 1,
            hireRate: 100,
          },
          createdAt: new Date(),
          status: "open",
        };

        const result = await taskCollection.insertOne(newTask);
        res.status(201).json({ success: true, taskId: result.insertedId });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to create new task." });
      }
    });

    app.get("/api/tasks/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const task = await taskCollection.findOne({ _id: new ObjectId(id) });
        if (!task) {
          return res.status(404).json({ error: "Task not found" });
        }
        res.send(task);
      } catch (error) {
        console.error("Backend Error:", error);
        return res
          .status(500)
          .json({ error: "Failed to query the database matrix directory." });
      }
    });

    app.post(
      "/api/proposals",
      verifyToken,
      verifyFreelancer,
      async (req, res) => {
        // task_id, freelancer_email, proposed_budget, estimated_days, cover_note, status,submitted_at

        try {
          const {
            task_id,
            freelancer_email,
            freelancer_name,
            proposed_budget,
            estimated_days,
            cover_note,
            status = "open",
            submitted_at,
          } = req.body;

          if (
            !task_id ||
            !freelancer_email ||
            !proposed_budget ||
            !estimated_days ||
            !cover_note
          ) {
            return res
              .status(400)
              .json({ error: "Missing required proposal fields." });
          }

          const existingProposal = await proposalCollection.findOne({
            task_id,
            freelancer_email,
          });
          if (existingProposal) {
            return res.status(400).json({
              error: "You have already submitted a proposal for this task.",
            });
          }

          const newProposal = {
            task_id,
            freelancer_email,
            freelancer_name,
            proposed_budget: parseFloat(proposed_budget),
            estimated_days: parseInt(estimated_days),
            cover_note,
            status: status || "pending",
            submitted_at: submitted_at || new Date(),
          };

          const result = await proposalCollection.insertOne(newProposal);
          res
            .status(201)
            .json({ success: true, proposalId: result.insertedId });
        } catch (error) {
          console.log(error);
          return res.status(500).json({ error: "Failed to submit proposal." });
        }
      },
    );

    // GET proposals by freelancer email (with task details)
    app.get("/api/proposals/freelancer/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);
        const proposals = await proposalCollection
          .find({ freelancer_email: email })
          .sort({ submitted_at: -1 })
          .toArray();

        // Enrich each proposal with task title and budget
        const enriched = await Promise.all(
          proposals.map(async (p) => {
            let task = null;
            try {
              task = await taskCollection.findOne(
                { _id: new ObjectId(p.task_id) },
                { projection: { title: 1, budget: 1, category: 1 } },
              );
            } catch (_) {}
            return {
              ...p,
              task_title: task?.title || "Unknown Task",
              task_budget: task?.budget || 0,
              task_category: task?.category || "",
            };
          }),
        );

        res.json(enriched);
      } catch (error) {
        console.error("Backend Error:", error);
        res
          .status(500)
          .json({ error: "Failed to fetch freelancer proposals." });
      }
    });

    // GET proposals received on a client's tasks
    app.get("/api/proposals/client/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);

        // 1. Find all tasks posted by this client
        const clientTasks = await taskCollection
          .find(
            { client_email: email },
            { projection: { _id: 1, title: 1, budget: 1, category: 1 } },
          )
          .toArray();

        if (clientTasks.length === 0) {
          return res.json([]);
        }

        // 2. Build a lookup map: taskId -> task info
        const taskMap = {};
        const taskIds = clientTasks.map((t) => {
          taskMap[t._id.toString()] = t;
          return t._id.toString();
        });

        // 3. Find all proposals whose task_id is in the set
        const proposals = await proposalCollection
          .find({ task_id: { $in: taskIds } })
          .sort({ submitted_at: -1 })
          .toArray();

        // 4. Enrich with task details
        const enriched = proposals.map((p) => {
          const task = taskMap[p.task_id] || {};
          return {
            ...p,
            task_title: task.title || "Unknown Task",
            task_budget: task.budget || 0,
            task_category: task.category || "",
          };
        });

        res.json(enriched);
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to fetch client proposals." });
      }
    });

    // PATCH proposal status (accept / reject)
    app.patch(
      "/api/proposals/:id/status",
      verifyToken,
      verifyClient,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { status } = req.body;

          if (!status || !["accepted", "rejected"].includes(status)) {
            return res
              .status(400)
              .json({ error: "Status must be 'accepted' or 'rejected'." });
          }

          const result = await proposalCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status } },
          );

          if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Proposal not found." });
          }

          if (status === "accepted") {
            const proposal = await proposalCollection.findOne({ _id: new ObjectId(id) });
            if (proposal && proposal.task_id) {
              await taskCollection.updateOne(
                { _id: new ObjectId(proposal.task_id) },
                { $set: { status: "In Progress" } },
              );
            }
          }

          res.json({ success: true, modifiedCount: result.modifiedCount });
        } catch (error) {
          console.error("Backend Error:", error);
          res.status(500).json({ error: "Failed to update proposal status." });
        }
      },
    );

    // POST payment status
    app.post("/api/payments", verifyToken, verifyClient, async (req, res) => {
      try {
        const { payment } = req.body;
        const result = await paymentCollection.insertOne(payment);
        res.status(201).json({ success: true, paymentId: result.insertedId });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to create payment." });
      }
    });

    // DELETE /api/tasks/:id
    app.delete("/api/tasks/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const task = await taskCollection.findOne({ _id: new ObjectId(id) });
        if (!task) return res.status(404).json({ error: "Task not found." });

        const acceptedProposal = await proposalCollection.findOne({
          task_id: id,
          status: "accepted",
        });
        if (acceptedProposal) {
          return res.status(400).json({
            error: "Cannot delete task: A proposal has already been approved.",
          });
        }

        const result = await taskCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json({ success: true, deletedCount: result.deletedCount });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to delete task." });
      }
    });

    // PUT /api/tasks/:id
    app.put("/api/tasks/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { description } = req.body;

        const task = await taskCollection.findOne({ _id: new ObjectId(id) });
        if (!task) return res.status(404).json({ error: "Task not found." });
        if (task.status !== "open") {
          return res.status(400).json({
            error: "Cannot edit task: Live status is no longer Open.",
          });
        }

        const result = await taskCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { description } },
        );
        res.json({ success: true, modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to update task." });
      }
    });

    // PATCH /api/tasks/:id/status
    app.patch(
      "/api/tasks/:id/status",
      verifyToken,
      async (req, res) => {
        if (req.user.role !== "admin" && req.user.role !== "client") {
          return res
            .status(403)
            .json({ msg: "You are not authorized to perform this action" });
        }
        try {
          const id = req.params.id;
          const { status } = req.body;

          const result = await taskCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status } },
          );
          res.json({ success: true, modifiedCount: result.modifiedCount });
        } catch (error) {
          console.error("Backend Error:", error);
          res.status(500).json({ error: "Failed to update task status." });
        }
      },
    );

    // PATCH /api/tasks/:id/deliverable
    app.patch(
      "/api/tasks/:id/deliverable",
      verifyToken,
      verifyFreelancer,
      async (req, res) => {
        try {
          const id = req.params.id;
          const { deliverable_url } = req.body;

          const result = await taskCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { deliverable_url, status: "Completed" } },
          );
          res.json({ success: true, modifiedCount: result.modifiedCount });
        } catch (error) {
          console.error("Backend Error:", error);
          res.status(500).json({ error: "Failed to submit deliverable." });
        }
      },
    );

    // GET /api/client/stats/:email
    app.get("/api/client/stats/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);
        const tasks = await taskCollection
          .find({ client_email: email })
          .toArray();
        const payments = await paymentCollection
          .find({ client_email: email, payment_status: "complete" })
          .toArray();

        const totalTasks = tasks.length;
        const openTasks = tasks.filter((t) => t.status === "open").length;
        const inProgress = tasks.filter(
          (t) => t.status === "In Progress" || t.status === "in progress",
        ).length;
        const totalSpent = payments.reduce((sum, p) => sum + p.amount, 0);

        res.json({ totalTasks, openTasks, inProgress, totalSpent });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to get client stats." });
      }
    });

    // GET /api/freelancer/stats/:email
    app.get("/api/freelancer/stats/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);
        const proposals = await proposalCollection
          .find({ freelancer_email: email })
          .toArray();
        const payments = await paymentCollection
          .find({ freelancer_email: email, payment_status: "complete" })
          .toArray();

        const totalProposals = proposals.length;
        const pending = proposals.filter(
          (p) => p.status === "pending" || p.status === "open",
        ).length;
        const accepted = proposals.filter(
          (p) => p.status === "accepted",
        ).length;
        const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);

        res.json({ totalProposals, pending, accepted, totalEarnings });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to get freelancer stats." });
      }
    });

    // GET /api/freelancer/activity/:email
    app.get("/api/freelancer/activity/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);

        const [proposals, payments] = await Promise.all([
          proposalCollection
            .find({ freelancer_email: email })
            .sort({ submitted_at: -1 })
            .limit(8)
            .toArray(),
          paymentCollection
            .find({ freelancer_email: email, payment_status: "complete" })
            .sort({ paid_at: -1 })
            .limit(8)
            .toArray(),
        ]);

        const events = [];

        proposals.forEach((proposal) => {
          events.push({
            id: `proposal-${proposal._id}`,
            type: "proposal_submitted",
            title: `Proposal ${proposal.status === "accepted" ? "Accepted" : "Submitted"}`,
            detail: `Task ${proposal.task_id} — $${proposal.proposed_budget ?? 0}`,
            timestamp: proposal.submitted_at
              ? new Date(proposal.submitted_at).toISOString()
              : new Date().toISOString(),
          });
        });

        payments.forEach((payment) => {
          events.push({
            id: `payment-${payment._id}`,
            type: "payment_received",
            title: `Payment Received: $${payment.amount ?? 0}`,
            detail: `Task ${payment.task_id || "unknown"}`,
            timestamp: payment.paid_at
              ? new Date(payment.paid_at).toISOString()
              : new Date().toISOString(),
          });
        });

        events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json(events.slice(0, 6));
      } catch (error) {
        console.error("Backend Error:", error);
        res
          .status(500)
          .json({ error: "Failed to load freelancer activity feed." });
      }
    });

    // GET /api/freelancers/profile/:email
    app.get("/api/freelancers/profile/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);
        const userDoc = await userCollection.findOne({ email });
        if (!userDoc) {
          return res.status(404).json({ error: "User not found." });
        }
        res.json(userDoc);
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to get profile." });
      }
    });

    // PATCH /api/freelancers/profile/:email
    app.patch("/api/freelancers/profile/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);
        const { name, image, skills, bio, hourlyRate } = req.body;

        const updateData = {};
        if (name) updateData.name = name;
        if (image) updateData.image = image;
        if (skills) updateData.skills = skills;
        if (bio) updateData.bio = bio;
        if (hourlyRate) updateData.hourlyRate = hourlyRate;

        const result = await userCollection.updateOne(
          { email },
          { $set: updateData },
        );
        res.json({ success: true, modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to update profile." });
      }
    });

    // GET /api/tasks/client/:email - Fetch all tasks posted by a specific client
    app.get("/api/tasks/client/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);
        const tasks = await taskCollection
          .find({ client_email: email })
          .sort({ createdAt: -1 })
          .toArray();

        // For each task, check if any accepted proposal exists
        const enriched = await Promise.all(
          tasks.map(async (t) => {
            const hasAccepted = await proposalCollection.findOne({
              task_id: t._id.toString(),
              status: "accepted",
            });
            return { ...t, hasAcceptedProposal: !!hasAccepted };
          }),
        );

        res.json(enriched);
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to fetch client tasks." });
      }
    });

    // GET /api/earnings/freelancer/:email - Fetch completed tasks + payments for a freelancer
    app.get("/api/earnings/freelancer/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);
        const payments = await paymentCollection
          .find({ freelancer_email: email, payment_status: "complete" })
          .sort({ paid_at: -1 })
          .toArray();

        // Enrich with task details
        const enriched = await Promise.all(
          payments.map(async (p) => {
            let task = null;
            try {
              task = await taskCollection.findOne(
                { _id: new ObjectId(p.task_id) },
                { projection: { title: 1, client_email: 1, client: 1 } },
              );
            } catch (_) {}
            return {
              ...p,
              task_title: task?.title || "Unknown Task",
              client_name:
                task?.client?.name || task?.client_email || "Unknown",
            };
          }),
        );

        res.json(enriched);
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to fetch earnings." });
      }
    });

    // GET /api/freelancer/active-projects/:email - Fetch active/completed projects
    app.get("/api/freelancer/active-projects/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);

        // Find accepted proposals for this freelancer
        const acceptedProposals = await proposalCollection
          .find({ freelancer_email: email, status: "accepted" })
          .toArray();

        // Get the task IDs from accepted proposals
        const taskIds = acceptedProposals.map((p) => p.task_id);

        if (taskIds.length === 0) return res.json([]);

        // Fetch the tasks
        const tasks = await taskCollection
          .find({ _id: { $in: taskIds.map((id) => new ObjectId(id)) } })
          .toArray();

        // Enrich with proposal info
        const enriched = tasks.map((t) => {
          const proposal = acceptedProposals.find(
            (p) => p.task_id === t._id.toString(),
          );
          return {
            ...t,
            proposed_budget: proposal?.proposed_budget,
            estimated_days: proposal?.estimated_days,
          };
        });

        res.json(enriched);
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to fetch active projects." });
      }
    });

    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (err) {
    console.log(err);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Skillswap Server is running!");
});

app.listen(5000, () => {
  console.log("Server is running on port 5000");
});
