import dns from "node:dns";
dns.setServers(["1.1.1.1", "1.0.0.1"]);

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";
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

    app.get("/api/freelancers", async (req, res) => {
      const query = { role: "freelancer" };
      const freelancers = await userCollection.find(query).toArray();
      res.send(freelancers);
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
