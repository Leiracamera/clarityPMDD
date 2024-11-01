CREATE TABLE daily_entries (
	entry_id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    mood VARCHAR(255),
    symptoms TEXT,
    energy_level INT CHECK (energy_level BETWEEN 1 AND 10),
    sleep_quality INT CHECK (sleep_quality BETWEEN 1 AND 10),
    notes TEXT
);

CREATE TABLE emotions (
    emotion_id SERIAL PRIMARY KEY,
    emotion_name VARCHAR(255) UNIQUE NOT NULL,
    emoji VARCHAR(10)  -- This will store the emoji character from an API
);

CREATE TABLE symptoms (
    symptom_id SERIAL PRIMARY KEY,
    symptom_name VARCHAR(255) UNIQUE NOT NULL,
    intensity VARCHAR(50)  -- Could be 'mild', 'moderate', 'severe'
);

CREATE TABLE quotes (
    quote_id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    author VARCHAR(255)
);