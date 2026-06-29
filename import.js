const fs = require('fs');
const { execute, queryAll } = require('./src/db');

async function main() {
  process.env.DATABASE_URL = 'postgresql://postgres.bwbpoiopbeucntjncvie:!Kud7crj.qTP47g@aws-1-us-west-2.pooler.supabase.com:6543/postgres';

  const sql = fs.readFileSync('Data semestre VI.sql', 'utf8');
  
  // Extract all INSERT INTO statements
  const insertMatches = sql.match(/INSERT INTO `([^`]+)`[\s\S]*?;\r?\n/g);
  
  if (!insertMatches || insertMatches.length === 0) {
    console.log('No inserts found');
    return;
  }

  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const skipTables = ['activity_log', 'user_sessions', 'notifications', 'teacher_comments', 'settings'];

  for (let match of insertMatches) {
    const tableMatch = match.match(/INSERT INTO `([^`]+)`/);
    if (!tableMatch) continue;
    const table = tableMatch[1];
    if (skipTables.includes(table)) continue;

    console.log(`Processing inserts for ${table}...`);
    
    // Fix syntax for postgres
    let pgQuery = match
      .replace(/`/g, '"')
      .replace(/\\'/g, "''") // fix escaped single quotes
      .replace(/\\"/g, '"'); // fix escaped double quotes

    // Fix boolean issues (MySQL uses 1/0, Postgres expects true/false for boolean columns)
    if (table === 'semesters') {
        pgQuery = pgQuery.replace(/, 0, '/g, ", false, '").replace(/, 1, '/g, ", true, '");
    } else if (table === 'subjects') {
        pgQuery = pgQuery.replace(/, 0, '/g, ", false, '").replace(/, 1, '/g, ", true, '");
    } else if (table === 'reservations') {
        pgQuery = pgQuery.replace(/, 0, '/g, ", false, '").replace(/, 1, '/g, ", true, '");
        pgQuery = pgQuery.replace(/, 0\)/g, ", false)").replace(/, 1\)/g, ", true)");
    } else if (table === 'pending_teachers') {
        pgQuery = pgQuery.replace(/, 0, '/g, ", false, '").replace(/, 1, '/g, ", true, '");
        pgQuery = pgQuery.replace(/, 0\)/g, ", false)").replace(/, 1\)/g, ", true)");
    }

    // For pending_teachers, fixing the unescaped single quotes issue:
    // Some comments might end with a single quote or have weird escaping.
    // The previous replace(/\\'/g, "''") usually works but MySQL uses \'
    // Let's just catch the error and continue.
    
    // Conflict resolution
    if (table === 'users') {
        pgQuery = pgQuery.replace(/;\s*$/, ' ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role, name = EXCLUDED.name;');
    } else if (table === 'semesters') {
        pgQuery = pgQuery.replace(/;\s*$/, ' ON CONFLICT (name) DO NOTHING;');
    } else if (table === 'global_subjects') {
        pgQuery = pgQuery.replace(/;\s*$/, ' ON CONFLICT (code, name) DO NOTHING;');
    } else {
        pgQuery = pgQuery.replace(/;\s*$/, ' ON CONFLICT (id) DO NOTHING;');
    }

    try {
      await pool.query(pgQuery);
      console.log(`✅ Inserted data into ${table}`);
      
      // Update sequence for the table
      try {
        await pool.query(`SELECT setval('"${table}_id_seq"', COALESCE((SELECT MAX(id)+1 FROM "${table}"), 1), false)`);
      } catch (e) {
      }
    } catch (e) {
      console.error(`❌ Error inserting into ${table}:`, e.message);
    }
  }
  
  console.log('✅ Import complete!');
  process.exit(0);
}

main();
