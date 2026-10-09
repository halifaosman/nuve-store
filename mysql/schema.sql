-- Nuvé store database (MySQL 8). deploy/setup.sh loads this automatically.
-- Safe to run again: it only creates what's missing. All times are stored in UTC.

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) NOT NULL PRIMARY KEY,
  order_number BIGINT NOT NULL AUTO_INCREMENT UNIQUE,
  access_token CHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL,
  -- pending_payment | awaiting_eft | eft_review | paid | sending | sent_to_bobgo | shipped | delivered | expired | cancelled
  payment_method ENUM('payfast','eft') NOT NULL,
  customer_first VARCHAR(100) NOT NULL,
  customer_last VARCHAR(100) NOT NULL,
  email VARCHAR(200) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address_street VARCHAR(200) NOT NULL,
  address_suburb VARCHAR(120) NOT NULL,
  address_city VARCHAR(120) NOT NULL,
  address_province VARCHAR(60) NOT NULL,
  address_postal VARCHAR(10) NOT NULL,
  address_company VARCHAR(200) NULL,
  items JSON NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  shipping_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping_method VARCHAR(200) NULL,
  total DECIMAL(10,2) NOT NULL,
  expires_at DATETIME(3) NULL,
  paid_at DATETIME(3) NULL,
  pf_payment_id VARCHAR(60) NULL,
  pop_path VARCHAR(200) NULL,
  pop_uploaded_at DATETIME(3) NULL,
  bobgo_order_id BIGINT NULL,
  bobgo_error TEXT NULL,
  tracking_reference VARCHAR(100) NULL,
  tracking_status VARCHAR(60) NULL,
  tracking_url VARCHAR(500) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  updated_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  KEY orders_status_idx (status),
  KEY orders_email_idx (email),
  KEY orders_tracking_idx (tracking_reference),
  KEY orders_created_idx (created_at)
) ENGINE=InnoDB AUTO_INCREMENT=1001 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS order_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  kind VARCHAR(40) NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  KEY order_events_order_idx (order_id),
  CONSTRAINT order_events_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Webhook deliveries already handled (Bob Go may send the same one twice)
CREATE TABLE IF NOT EXISTS processed_webhooks (
  `key` VARCHAR(255) NOT NULL PRIMARY KEY,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Failed admin logins, used to lock out password guessing
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  KEY login_attempts_ip_idx (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- Page content ----------
CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(60) NOT NULL PRIMARY KEY,
  value JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS reviews (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(300) NOT NULL,
  stars TINYINT NOT NULL DEFAULT 5,
  title VARCHAR(300) NULL,
  body TEXT NOT NULL,
  photo VARCHAR(300) NULL,
  avatar VARCHAR(300) NULL,
  verified TINYINT(1) NOT NULL DEFAULT 0,
  featured TINYINT(1) NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT reviews_stars_chk CHECK (stars BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS videos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  video VARCHAR(300) NOT NULL,
  caption VARCHAR(300) NULL,
  avatar VARCHAR(300) NULL,
  poster VARCHAR(300) NULL,
  sort INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS photos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  image VARCHAR(300) NOT NULL,
  caption VARCHAR(300) NULL,
  sort INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS logos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  image VARCHAR(300) NOT NULL,
  name VARCHAR(300) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sections (
  id CHAR(36) NOT NULL PRIMARY KEY,
  eyebrow VARCHAR(300) NULL,
  heading VARCHAR(300) NOT NULL,
  body TEXT NULL,
  image VARCHAR(300) NULL,
  side VARCHAR(20) NOT NULL DEFAULT 'Image left',
  cta VARCHAR(300) NULL,
  sort INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- Contact form messages ----------
CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(200) NOT NULL,
  phone VARCHAR(30) NULL,
  order_ref VARCHAR(30) NULL,
  topic VARCHAR(60) NULL,
  message TEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'new',   -- new | read | done
  ip VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  KEY messages_status_idx (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Simple per-IP limits for public forms (contact, order tracking)
CREATE TABLE IF NOT EXISTS rate_hits (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bucket VARCHAR(40) NOT NULL,
  ip VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  KEY rate_hits_idx (bucket, ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Ad tracking details captured at checkout, so the Purchase event can be sent to Meta when the order is paid
CREATE TABLE IF NOT EXISTS order_tracking (
  order_id CHAR(36) NOT NULL PRIMARY KEY,
  fbp VARCHAR(200) NULL,
  fbc VARCHAR(500) NULL,
  client_ip VARCHAR(64) NULL,
  user_agent VARCHAR(500) NULL,
  source_url VARCHAR(500) NULL,
  consent VARCHAR(10) NOT NULL DEFAULT 'yes',      -- 'no' = visitor declined ad tracking
  purchase_sent_at DATETIME(3) NULL,
  purchase_result VARCHAR(300) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  CONSTRAINT order_tracking_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
