import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv";
import expressLayouts from "express-ejs-layouts"

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;


const db = new pg.Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

db.connect((err) =>{
    if (err) {
        console.error("Database connection error:", err.stack);
    } else {
        console.log("Connected to database");
    }
});

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(expressLayouts);
app.set("layout", "layouts/layout");
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


app.get("/", (req, res) => {
    res.render("index");
});

app.get("/test-header", (req, res) => {
    res.render("partials/header");
});

app.get('/entries', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM daily_entries ORDER BY date DESC');
        res.render("entries", { entries: result.rows });
    } catch (error) {
        console.error('Error fetching entries:', error);
        res.status(500).send('Error fetching entries');
    }
});

app.post("/entries", async (req, res) => {
    const { date, mood, symptoms, energy_level, sleep_quality, notes} = req.body;

    try {
        const query = 
        `INSERT INTO daily_entries (date, mood, symptoms, energy_level, sleep_quality, notes)
        VALUES ($1, $2, $3, $4, $5, $6)`
        ;
        await db.query(query, [date, mood, symptoms, energy_level, sleep_quality, notes]);
        res.redirect('/entries');
    } catch (error) {
        console.error("Error adding entry:", error);
        res.status(500).send("Error adding entry");
    }
});

app.post("/edit/:id", async (req, res) => {
    const entryId = req.params.id;
    const { date, mood, symptoms, energy_level, sleep_quality, notes } = req.body;

    try {
        const query = `
            UPDATE daily_entries
            SET date = COALESCE($1, date),
                mood = COALESCE($2, mood),
                symptoms = COALESCE($3, symptoms),
                energy_level = COALESCE($4, energy_level),
                sleep_quality = COALESCE($5, sleep_quality),
                notes = COALESCE($6, notes)
            WHERE entry_id = $7
        `;
        await db.query(query, [date, mood, symptoms, energy_level, sleep_quality, notes, entryId]);
        console.log("Entry has been updated");
        res.redirect('/entries');  // Redirect to entries list after update
    } catch (error) {
        console.error("Error updating entry:", error);
        res.status(500).send("Error updating entry");
    }
});

app.post("/delete/:id", async (req, res) => {
    const entryId = req.params.id;

    try {
        const query = "DELETE FROM daily_entries WHERE entry_id = $1";
        await db.query(query, [entryId]);
        console.log("Entry has been deleted from database");
        res.redirect("/entries");
    } catch (error) {
        console.error("Error deleting entry", error)
        res.status(500).send("Error deleting entry");
    }
});

app.get("/search", async (req, res) => {
    console.log("req.query:", req.query);

    if (!req.query.date) {
        console.log("Initial load - no date provided.");
        return res.render("search", {entry: null, message: null});
    }

    try {
        const query = `SELECT * FROM daily_entries WHERE date = $1`;
        console.log("Running query with date:", req.query.date);

        const result = await db.query( query, [req.query.date]);
        console.log("Query result:", result.rows);

        if (result.rows.length > 0) {
            console.log("Entry found:", result.rows[0]);
            res.render("search", { entry: result.rows[0], message: null });
        } else {
            console.log("No entry found for this date.");
            res.render("search", { entry: null, message: "No entry found for this date." });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("An error occurred while retrieving the entry.");
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });