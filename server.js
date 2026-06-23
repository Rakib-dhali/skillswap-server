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
