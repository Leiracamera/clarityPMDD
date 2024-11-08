import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv";
import expressLayouts from "express-ejs-layouts"
import axios from "axios";
import bcrypt from 'bcrypt';
import session from 'express-session';



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
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));

app.use((req, res, next) => {
    if (req.session.user) {
        res.locals.user = req.session.user; 
        console.log("User session set in locals:", res.locals.user);
    } else {
        res.locals.user = undefined; 
        console.log("No user session available");
    }
    next();
});

app.use(async (req, res, next) => {
    try {
        const response = await axios.get("https://www.affirmations.dev/");
        res.locals.quote = response.data.affirmation;
    } catch (error) {
        console.error("Error fetching the quote:", error.message);
        res.locals.quote = "This, too, shall pass.";
    }
    next();
});

app.get("/", (req, res) => {

    res.render("index");
});

app.get("/test-home", (req, res) => {

    res.render("bootstrap-home-page");
});

app.get('/new-entry', (req, res) => {
    res.render("new-entry");
});

app.post('/new-entry', async (req, res) => {
    const { date, mood, symptoms, energy_level, sleep_quality, notes } = req.body;

    if (!req.session.user_id) {
        return res.status(401).send("Unauthorized: Please log in.");
    }

    try {

        await db.query(
            `INSERT INTO daily_entries (date, mood, symptoms, energy_level, sleep_quality, notes, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [date, mood, symptoms, energy_level, sleep_quality, notes, req.session.user_id]
        );

        res.redirect('/entries');
    } catch (error) {
        console.error("Error adding entry:", error);
        res.status(500).send("Error adding entry");
    }
});

app.get('/entries', async (req, res) => {

if (!req.session.user_id) {
    return res.status(401).send("Unauthorized: Please log in.")
}

try {
    const result = await db.query(
        'SELECT * FROM daily_entries WHERE user_id = $1 ORDER BY date DESC',
        [req.session.user_id]
    );
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

app.get('/analytics', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT date, mood
            FROM daily_entries
            WHERE date >= NOW() - INTERVAL '1 month'
            ORDER BY date ASC
        `);

        const dates = result.rows.map(row => row.date.toISOString().split("T")[0]);
        const moodData = result.rows.map(row => row.mood);

        res.render("analytics", {
            dates: JSON.stringify(dates),
            moodData: JSON.stringify(moodData)
        });
    } catch (error) {
        console.error("Error fetching data:", error);
        res.status(500).send("Error fetching data");
    }
});

app.get('/new-user', (req, res) => {
    res.render("new-user");
});

app.post('/new-user', async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {

        await db.query(
            `INSERT INTO users (username, email, password)
             VALUES ($1, $2, $3)`,
            [username, email, hashedPassword]
        );

        res.send("New user created successfully!");
    } catch (error) {
        console.error("Error adding entry:", error);
        res.status(500).send("Error adding user");
    }
});


app.get('/login', (req, res) => {
    res.render("login");
});

app.post('/login', async (req, res) => {
    const {email, password } = req.body;

    try {
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).send("Invalid email or password");
        }

        req.session.user = user;
        console.log('Session data after login:', req.session);        
        res.send("Login successful!");
    } catch (error) {
        console.error("Error logging in:", error.message);
        res.status(500).send("An error ocurred during login");
    }
});

app.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                return res.status(400).send('Unable to log out');
            } else {
                res.redirect('/login'); // Or redirect to home page, if preferred
            }
        });
    } else {
        res.redirect('/login');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });