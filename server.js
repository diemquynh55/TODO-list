// server.js
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();

// ✅ Cho phép tất cả origin (tạm để test cho chắc ăn)
app.use(cors());
app.options("*", cors());

app.use(express.json());

// Pool kết nối MySQL: ưu tiên Railway, fallback .env
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST,
  port: process.env.MYSQLPORT || process.env.DB_PORT || 3306,
  user: process.env.MYSQLUSER || process.env.DB_USER,
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD,
  database: process.env.MYSQLDATABASE || process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// Test kết nối DB
(async () => {
  try {
    const [rows] = await pool.query("SELECT DATABASE() AS db, 1+1 AS ok");
    console.log("✅ DB test ok:", rows[0]);
  } catch (err) {
    console.error("❌ DB test failed:", err.message);
  }
})();

// Healthcheck
app.get("/health", (_req, res) => res.json({ ok: true }));

// ========== Helper ==========
async function getAllTasks() {
  const sql = `
    SELECT t.id, t.title, t.status, t.due_date, t.category_id,
           c.name AS category_name, t.position
    FROM tasks t
    LEFT JOIN categories c ON t.category_id = c.id
    ORDER BY 
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date ASC,
      t.position ASC, 
      t.id DESC
  `;
  const [rows] = await pool.query(sql);
  return rows;
}

// ========== API TASKS ==========
app.get("/api/tasks", async (_req, res) => {
  try {
    const rows = await getAllTasks();
    res.json(rows);
  } catch (err) {
    console.error("Error /api/tasks:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const { title, category_id, due_date } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Title is required" });
    }

    // Validate deadline
    if (due_date) {
      const today = new Date().toISOString().split("T")[0];
      if (due_date < today) {
        return res
          .status(400)
          .json({ message: "Deadline phải từ hôm nay trở đi" });
      }
    }

    const position = Date.now();
    const catId = category_id ? Number(category_id) : null;

    const [result] = await pool.query(
      "INSERT INTO tasks (title, status, position, category_id, due_date) VALUES (?, 0, ?, ?, ?)",
      [title.trim(), position, catId, due_date || null]
    );

    const [rows] = await pool.query(
      `SELECT t.id, t.title, t.status, t.category_id, t.due_date, c.name AS category_name
       FROM tasks t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Error POST /api/tasks:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const fields = [];
    const values = [];

    const allowed = ["title", "status", "category_id", "due_date", "position"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (!fields.length)
      return res.status(400).json({ message: "Nothing to update" });

    values.push(id);
    await pool.query(
      `UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`,
      values
    );

    const [rows] = await pool.query("SELECT * FROM tasks WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Error PUT /api/tasks:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM tasks WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Error DELETE /api/tasks:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/tasks/reorder", async (req, res) => {
  const { ids } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 0; i < ids.length; i++) {
      await conn.query("UPDATE tasks SET position = ? WHERE id = ?", [
        i,
        ids[i],
      ]);
    }
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error("Error reorder:", err);
    res.status(500).json({ message: "Server error" });
  } finally {
    conn.release();
  }
});

// ========== API CATEGORIES ==========
app.get("/api/categories", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM categories ORDER BY name ASC"
    );
    res.json(rows);
  } catch (err) {
    console.error("Error /api/categories:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/categories", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    const [result] = await pool.query(
      "INSERT INTO categories (name) VALUES (?)",
      [name.trim()]
    );
    const [rows] = await pool.query("SELECT * FROM categories WHERE id = ?", [
      result.insertId,
    ]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Error POST /api/categories:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
});
