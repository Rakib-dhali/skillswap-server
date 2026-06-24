import dns from "node:dns";
dns.setServers(["1.1.1.1", "1.0.0.1"]);

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    await client.connect();
    const db = client.db("skillswap");
    const userCollection = db.collection("user");
    const taskCollection = db.collection("tasks");
    const proposalCollection = db.collection("proposals");

    app.get("/api/freelancers", async (req, res) => {
      const query = { role: "freelancer" };
      const freelancers = await userCollection.find(query).toArray();
      res.send(freelancers);
    });
     app.get("/api/freelancers/:id", async (req, res)=> {
      try {
        const id = req.params.id;
        const freelancer = await userCollection.findOne({ _id: new ObjectId(id) });
        if (!freelancer) {
          return res.status(404).json({ error: "Freelancer not found" });
        }
        res.send(freelancer);
      } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ error: "Failed to query the database matrix directory." });
      }
    })
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

    app.post("/api/tasks", async (req, res) => {
      try {
        const { title, category, budget, description, deadline, client_email, client_name } = req.body;
        
        if (!title || !category || !budget || !description) {
          return res.status(400).json({ error: "Missing required task fields." });
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
            hireRate: 100
          },
          createdAt: new Date(),
          status: "open"
        };

        const result = await taskCollection.insertOne(newTask);
        res.status(201).json({ success: true, taskId: result.insertedId });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to create new task." });
      }
    });

    app.get("/api/tasks/:id", async (req, res)=> {
      try {
        const id = req.params.id;
        const task = await taskCollection.findOne({ _id: new ObjectId(id) });
        if (!task) {
          return res.status(404).json({ error: "Task not found" });
        }
        res.send(task);
      } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ error: "Failed to query the database matrix directory." });
      }
    })

    app.post("/api/proposals", async(req, res)=> {
      // task_id, freelancer_email, proposed_budget, estimated_days, cover_note, status,submitted_at

      try {
        const {task_id, freelancer_email,freelancer_name, proposed_budget, estimated_days, cover_note, status="open", submitted_at} = req.body;
        
        if (!task_id || !freelancer_email || !proposed_budget || !estimated_days || !cover_note) {
          return res.status(400).json({ error: "Missing required proposal fields." });
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
        res.status(201).json({ success: true, proposalId: result.insertedId });
      }catch(error){
        console.log(error);
        return res.status(500).json({ error: "Failed to submit proposal." });
        
      }
    })
   
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
                { projection: { title: 1, budget: 1, category: 1 } }
              );
            } catch (_) {}
            return { ...p, task_title: task?.title || "Unknown Task", task_budget: task?.budget || 0, task_category: task?.category || "" };
          })
        );

        res.json(enriched);
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to fetch freelancer proposals." });
      }
    });

    // GET proposals received on a client's tasks
    app.get("/api/proposals/client/:email", async (req, res) => {
      try {
        const email = decodeURIComponent(req.params.email);

        // 1. Find all tasks posted by this client
        const clientTasks = await taskCollection
          .find({ client_email: email }, { projection: { _id: 1, title: 1, budget: 1, category: 1 } })
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
          return { ...p, task_title: task.title || "Unknown Task", task_budget: task.budget || 0, task_category: task.category || "" };
        });

        res.json(enriched);
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to fetch client proposals." });
      }
    });

    // PATCH proposal status (accept / reject)
    app.patch("/api/proposals/:id/status", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        if (!status || !["accepted", "rejected"].includes(status)) {
          return res.status(400).json({ error: "Status must be 'accepted' or 'rejected'." });
        }

        const result = await proposalCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Proposal not found." });
        }

        res.json({ success: true, modifiedCount: result.modifiedCount });
      } catch (error) {
        console.error("Backend Error:", error);
        res.status(500).json({ error: "Failed to update proposal status." });
      }
    });


    await client.db("admin").command({ ping: 1 });
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
