const db = require('./index');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

async function initializeDatabase() {
  // Events Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      full_content TEXT,
      cover_image TEXT,
      category VARCHAR(100),
      location_name VARCHAR(255),
      location_address TEXT,
      starts_at TIMESTAMP WITH TIME ZONE,
      ends_at TIMESTAMP WITH TIME ZONE,
      event_type VARCHAR(50),
      status VARCHAR(50) DEFAULT 'draft',
      featured BOOLEAN DEFAULT false,
      registration_url TEXT,
      max_attendees INTEGER,
      price DECIMAL(12,2) DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Users Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(20) DEFAULT 'user',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'`);

  // Converte colunas ENUM para VARCHAR se necessário
  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'event_type'
        AND udt_name != 'varchar'
      ) THEN
        ALTER TABLE events ALTER COLUMN event_type TYPE VARCHAR(50) USING event_type::text;
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'status'
        AND udt_name != 'varchar'
      ) THEN
        ALTER TABLE events ALTER COLUMN status TYPE VARCHAR(50) USING status::text;
      END IF;
    END$$;
  `);

  // Seed Default Admin
  const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [env.ADMIN_EMAIL]);
  if (rows.length === 0) {
    const hashedPassword = bcrypt.hashSync(env.ADMIN_PASSWORD, 8);
    await db.query(
      'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4)',
      [env.ADMIN_EMAIL, hashedPassword, env.ADMIN_NAME, 'admin']
    );
    console.log(`Default admin criado: ${env.ADMIN_EMAIL}`);
  } else {
    await db.query('UPDATE users SET role = $1 WHERE email = $2', ['admin', env.ADMIN_EMAIL]);
  }

  // Financial entries
  await db.query(`
    CREATE TABLE IF NOT EXISTS financial_entries (
      id SERIAL PRIMARY KEY,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(50) NOT NULL,
      type VARCHAR(10) NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      payment_status VARCHAR(20) NOT NULL,
      date DATE NOT NULL,
      responsible VARCHAR(100),
      priority VARCHAR(10) DEFAULT 'media',
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // Operational tasks
  await db.query(`
    CREATE TABLE IF NOT EXISTS operational_tasks (
      id SERIAL PRIMARY KEY,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      responsible VARCHAR(100),
      deadline TIMESTAMP WITH TIME ZONE,
      status VARCHAR(20) DEFAULT 'pendente',
      priority VARCHAR(10) DEFAULT 'media',
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // Gallery and Albums
  await db.query(`
    CREATE TABLE IF NOT EXISTS albums (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
      cover_image TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS gallery (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255),
      album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
      image TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  // Products
  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      full_content TEXT,
      cover_image TEXT,
      category VARCHAR(100),
      price DECIMAL(12,2) DEFAULT 0,
      stock INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'draft',
      featured BOOLEAN DEFAULT false,
      whatsapp VARCHAR(20),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Product Photos (galeria de demonstração)
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_photos (
      id SERIAL PRIMARY KEY,
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      image TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Projects
  await db.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      full_content TEXT,
      cover_image TEXT,
      video_url VARCHAR(500),
      category VARCHAR(100),
      status VARCHAR(50) DEFAULT 'draft',
      featured BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await db.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS video_url VARCHAR(500)`);

  // Site Settings
  await db.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Artists
  await db.query(`
    CREATE TABLE IF NOT EXISTS artists (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      project_name VARCHAR(255),
      age INTEGER,
      musical_styles TEXT,
      presskit_url TEXT,
      career_years INTEGER,
      cover_image TEXT,
      profile_image TEXT,
      biography TEXT,
      status VARCHAR(50) DEFAULT 'draft',
      featured BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS artist_photos (
      id SERIAL PRIMARY KEY,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      image TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS artist_videos (
      id SERIAL PRIMARY KEY,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      video_url TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS artist_tracks (
      id SERIAL PRIMARY KEY,
      artist_id INTEGER REFERENCES artists(id) ON DELETE CASCADE,
      audio_url TEXT NOT NULL,
      title VARCHAR(200),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // NLista (Credenciamento)
  await db.query(`
    CREATE TABLE IF NOT EXISTS list_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS list_registrations (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      cpf_rg VARCHAR(50),
      phone VARCHAR(30),
      list_type_id INTEGER REFERENCES list_types(id) ON DELETE SET NULL,
      parking BOOLEAN DEFAULT false,
      payment_status VARCHAR(20) DEFAULT 'pendente',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Displays (Telões)
  await db.query(`
    CREATE TABLE IF NOT EXISTS displays (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      screen_code VARCHAR(60) UNIQUE NOT NULL,
      youtube_url TEXT NOT NULL,
      loop BOOLEAN DEFAULT true,
      autoplay BOOLEAN DEFAULT true,
      fullscreen BOOLEAN DEFAULT true,
      last_seen TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  // Contact Messages
  await db.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      telefone VARCHAR(30),
      assunto VARCHAR(255) NOT NULL,
      mensagem TEXT NOT NULL,
      lido BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await db.query(`ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS telefone VARCHAR(30)`);
}

module.exports = { initializeDatabase };