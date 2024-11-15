import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv";
import expressLayouts from "express-ejs-layouts"
import axios from "axios";
import bcrypt from "bcrypt";
import session from "express-session";
import flash from "connect-flash";
import passport from "passport";
import {Strategy as LocalStrategy} from "passport-local";
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';




dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const saltRounds = 10;

// Database connection
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

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(expressLayouts);
app.set('views', './views');
app.set("layout", "layouts/layout");

// Parse request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configure sessions
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000 // Expires in 24hrs
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// Set up flash messages
app.use(flash());
app.use((req, res, next) => {
    res.locals.successMessage = req.flash('success');
    res.locals.errorMessage = req.flash('error');
    res.locals.infoMessage = req.flash('info');
    next();
});

// Middleware to set user data in `res.locals` for templates
app.use((req, res, next) => {
    res.locals.user = req.user || undefined; 
    console.log("User session set in locals:", res.locals.user);
    next();
});

// Middleware to fetch and display affirmations from API
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

// Define and config Passport local strategy
passport.use('local', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
}, async (email, password, done) => {
    try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
        const user = result.rows[0];

        if (!user) {
            return done (null, false, {message: 'Incorrect email.'});
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return done (null, false, {message: 'Incorrect password.'});
        }
        return done (null, user);
    } catch (error) {
        return done(error);
    }
}));

// Define and config Google OAuth Strategy
passport.use('google', new GoogleStrategy ({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
},
async (accessToken, refreshToken, profile, done) => {
    try {
        const result = await db.query("SELECT * FROM users WHERE google_id = $1", [profile.id]);
        let user = result.rows[0];

        if (!user) {
            const insertResult = await db.query(
                `INSERT INTO users (username, email, google_id) VALUES ($1, $2, $3) RETURNING *`,
                [profile.displayName, profile.emails[0].value, profile.id]
            );
            user = insertResult.rows[0];
        }
        return done(null, user);
    } catch (error) {
        return done(error);
    }
}
));

passport.serializeUser((user, done) => {
    done(null, user.user_id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const result = await db.query('SELECT * FROM users WHERE user_id = $1', [id]);
        const user = result.rows[0];
        done(null, user); 
    } catch (error) {
        done(error);
    }
});

// Define middleware functions to present access or ensure authentication
function preventLoginAccess(req, res, next) {
    if (req.isAuthenticated()) {
        req.flash("info", "You are already logged in.");
        return res.redirect("/");
    };
    next();
};

function ensureAuth(req, res, next) {
    if(req.isAuthenticated()) {
        return next();
    } else {
        res.redirect('/login');
    };
};

app.get('/login', preventLoginAccess, (req, res) => {
    res.render("login");
});

app.post('/login', passport.authenticate('local', {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true
}));

app.get('/new-user', preventLoginAccess, (req, res) => {
    res.render("new-user");
});

app.post('/new-user', async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    if(!password) {
        req.flash('error', 'Password is required to make an account');
        return res.redirect('/new-user');
    }

    try {

        const existingUser = await db.query("SELECT * FROM users WHERE email = $1", [email]);
        
        if (existingUser.rows.length > 0) {
            req.flash('error', 'An account with this email already exists. Please log in instead.');
            return res.redirect('/login');
        }
        
        const result = await db.query(
            `INSERT INTO users (username, email, password)
             VALUES ($1, $2, $3) RETURNING *`,
            [username, email, hashedPassword]
        );

        const user = result.rows[0];

        req.login(user, (err) => {
            if (err) {
                console.error("Error logging in after registrations:", err);
                req.flash("error", "Account created, please log in with your details.");
                return res.redirect('/login');
            }

            req.flash("success", "Welcome! Your account has been created and you are now logged in.")
            return res.redirect('/');
        });

      } catch (error) {
        console.error("Error adding entry:", error);
        req.flash("error", "An error occurred while creating the account.")
        res.status(500).send("Error adding user");
    }
});

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) {
            console.error("Logout error:", err);
            return next(err);
        }
        req.flash('success', 'You have logged out successfully.');
        res.redirect('/login');
    });
});

app.post('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) {
            console.error("Logout error:", err);
            return next(err);
        }
        req.flash('success', 'You have logged out successfully.');
        res.redirect('/login');
    });
});

// Google OAuth login routes
app.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email']
}));

//Google OAuth callback route
app.get('/auth/google/callback', passport.authenticate('google', {
    failureRedirect: '/login',
    failureFlash: 'Google authentication failed. Please try again.'
}), (req, res) => {
    res.redirect('/');
});

app.get("/", (req, res) => {

    res.render("index");
});

app.get('/new-entry', ensureAuth, (req, res) => {
    res.render("new-entry");
});

app.post('/new-entry', ensureAuth, async (req, res) => {
    const { date, mood, symptoms, energy_level, sleep_quality, notes } = req.body;

    try {

        await db.query(
            `INSERT INTO daily_entries (date, mood, symptoms, energy_level, sleep_quality, notes, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [date, mood, symptoms, energy_level, sleep_quality, notes, req.user.user_id]
        );

        req.flash("success", "New Entry Added");
        res.redirect('/entries');
    } catch (error) {
        console.error("Error adding entry:", error);
        req.flash("error", "Error adding entry, please try again.");
        res.redirect('/new-entry');
    }
});

app.get('/entries', ensureAuth, async (req, res) => {

try {
    const result = await db.query(
        'SELECT * FROM daily_entries WHERE user_id = $1 ORDER BY date DESC',
        [req.user.user_id]
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

app.post("/edit/:id", ensureAuth, async (req, res) => {
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
            WHERE entry_id = $7 AND user_id = $8
        `;
        await db.query(query, [date, mood, symptoms, energy_level, sleep_quality, notes, entryId, req.user.user_id]);
        console.log("Entry has been updated");
        req.flash("success", "Entry has been successfully edited!")
        res.redirect('/entries');  // Redirect to entries list after update
    } catch (error) {
        console.error("Error updating entry:", error);
        req.flash("error", "An error occurred while editing the entry, please try again.")
        res.redirect('/entries');
    }
});

app.post("/delete/:id", ensureAuth, async (req, res) => {
    const entryId = req.params.id;
    
    try {
        const query = "DELETE FROM daily_entries WHERE entry_id = $1 AND user_id = $2";
        await db.query(query, [entryId, req.user.user_id]);
        req.flash("success", "Entry has been successfully deleted!")
        console.log("Entry has been deleted from database");
        res.redirect("/entries");
    } catch (error) {
        console.error("Error deleting entry", error)
        req.flash("error", "An error occurred while deleting the entry, please try again.")
        res.redirect("/entries");
    }
});

app.get("/search", ensureAuth, async (req, res) => {
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

app.get('/analytics', ensureAuth, async (req, res) => {
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

app.use((req, res) => {
    res.status(404).render('404', { title: "Page Not Found" });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });