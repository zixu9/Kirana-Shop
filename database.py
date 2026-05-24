"""
database.py - SQLite Database Management
Kirana Shop Inventory & Credit Management System
"""

import sqlite3
import hashlib
import os
from datetime import datetime

DB_PATH = "kirana_shop.db"


def get_connection():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def dict_row(row):
    """Convert sqlite3.Row to dict."""
    if row is None:
        return None
    return dict(row)


def dict_rows(rows):
    """Convert list of sqlite3.Row to list of dicts."""
    return [dict(row) for row in rows]


def hash_password(password):
    """Hash password with SHA-256."""
    return hashlib.sha256(password.encode()).hexdigest()


def init_db():
    """Initialize database with all tables and sample data."""
    conn = get_connection()
    cur = conn.cursor()

    # ─── USERS ───────────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT    NOT NULL UNIQUE,
            password    TEXT    NOT NULL,
            full_name   TEXT    NOT NULL,
            role        TEXT    NOT NULL DEFAULT 'staff',
            is_active   INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ─── SESSIONS ────────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token       TEXT    PRIMARY KEY,
            user_id     INTEGER NOT NULL,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # ─── CATEGORIES ──────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL UNIQUE,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ─── PRODUCTS ────────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT    NOT NULL,
            category_id     INTEGER,
            barcode         TEXT    UNIQUE,
            purchase_price  REAL    NOT NULL DEFAULT 0,
            selling_price   REAL    NOT NULL DEFAULT 0,
            stock_qty       INTEGER NOT NULL DEFAULT 0,
            low_stock_alert INTEGER NOT NULL DEFAULT 10,
            unit            TEXT    NOT NULL DEFAULT 'pcs',
            is_active       INTEGER NOT NULL DEFAULT 1,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    """)

    # ─── CUSTOMERS ───────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            phone       TEXT,
            address     TEXT,
            credit_limit REAL   NOT NULL DEFAULT 5000,
            is_active   INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ─── INVOICES ────────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS invoices (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number  TEXT    NOT NULL UNIQUE,
            customer_id     INTEGER,
            subtotal        REAL    NOT NULL DEFAULT 0,
            discount        REAL    NOT NULL DEFAULT 0,
            tax             REAL    NOT NULL DEFAULT 0,
            total           REAL    NOT NULL DEFAULT 0,
            paid_amount     REAL    NOT NULL DEFAULT 0,
            payment_mode    TEXT    NOT NULL DEFAULT 'cash',
            status          TEXT    NOT NULL DEFAULT 'paid',
            notes           TEXT,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        )
    """)

    # ─── INVOICE ITEMS ───────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS invoice_items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id  INTEGER NOT NULL,
            product_id  INTEGER NOT NULL,
            product_name TEXT   NOT NULL,
            qty         INTEGER NOT NULL,
            price       REAL    NOT NULL,
            discount    REAL    NOT NULL DEFAULT 0,
            total       REAL    NOT NULL,
            FOREIGN KEY (invoice_id) REFERENCES invoices(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    """)

    # ─── CREDITS (UDHAAR) ────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS credits (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            invoice_id  INTEGER,
            amount      REAL    NOT NULL,
            balance     REAL    NOT NULL,
            type        TEXT    NOT NULL DEFAULT 'debit',
            notes       TEXT,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            FOREIGN KEY (invoice_id) REFERENCES invoices(id)
        )
    """)

    # ─── SUPPLIERS ───────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS suppliers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            phone       TEXT,
            email       TEXT,
            address     TEXT,
            gstin       TEXT,
            is_active   INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        )
    """)

    # ─── PURCHASES ───────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS purchases (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id     INTEGER,
            product_id      INTEGER NOT NULL,
            qty             INTEGER NOT NULL,
            purchase_price  REAL    NOT NULL,
            total           REAL    NOT NULL,
            paid            REAL    NOT NULL DEFAULT 0,
            notes           TEXT,
            created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    """)

    conn.commit()

    # ─── SEED DATA ───────────────────────────────────────────────────────────
    _seed_data(cur, conn)

    conn.close()
    print("✅ Database initialized successfully.")


def _seed_data(cur, conn):
    """Insert sample data if tables are empty."""

    # Admin user
    cur.execute("SELECT COUNT(*) FROM users")
    if cur.fetchone()[0] == 0:
        cur.execute("""
            INSERT INTO users (username, password, full_name, role)
            VALUES (?, ?, ?, ?)
        """, ("admin", hash_password("admin123"), "Shop Owner", "admin"))

    # Categories
    cur.execute("SELECT COUNT(*) FROM categories")
    if cur.fetchone()[0] == 0:
        categories = [
            ("Grocery",), ("Dairy",), ("Beverages",),
            ("Snacks",), ("Personal Care",), ("Household",),
            ("Medicines",), ("Stationery",)
        ]
        cur.executemany("INSERT INTO categories (name) VALUES (?)", categories)

    # Products
    cur.execute("SELECT COUNT(*) FROM products")
    if cur.fetchone()[0] == 0:
        products = [
            ("Aashirvaad Atta 5kg",    1, "8901725001011", 195, 220, 50, 10, "bag"),
            ("Tata Salt 1kg",          1, "8901295001010", 18,  22,  80, 15, "pcs"),
            ("Amul Butter 500g",       2, "8901063150015", 220, 250, 30, 8,  "pcs"),
            ("Amul Milk 1L",           2, "8901063050018", 55,  62,  40, 10, "pcs"),
            ("Coca-Cola 2L",           3, "5449000000996", 90,  105, 24, 6,  "bottle"),
            ("Bisleri Water 1L",       3, "8906003410023", 15,  20,  60, 20, "bottle"),
            ("Lays Classic 26g",       4, "8901491101061", 10,  15,  100,20, "pcs"),
            ("Parle-G 150g",           4, "8901719111132", 10,  14,  90, 20, "pcs"),
            ("Colgate 200g",           5, "8901314003073", 60,  75,  25, 8,  "pcs"),
            ("Dettol Soap 75g",        5, "8901396053040", 35,  45,  40, 10, "pcs"),
            ("Surf Excel 1kg",         6, "8901030592131", 95,  115, 20, 5,  "pcs"),
            ("Lizol 500ml",            6, "8901554501012", 110, 135, 15, 5,  "bottle"),
            ("Disprin 10s",            7, "5012218001025", 12,  18,  50, 15, "strip"),
            ("Notebook A4 200pg",      8, "NA",            45,  60,  30, 10, "pcs"),
        ]
        cur.executemany("""
            INSERT INTO products
              (name, category_id, barcode, purchase_price, selling_price, stock_qty, low_stock_alert, unit)
            VALUES (?,?,?,?,?,?,?,?)
        """, products)

    # Customers
    cur.execute("SELECT COUNT(*) FROM customers")
    if cur.fetchone()[0] == 0:
        customers = [
            ("Pankaj",   "0000000000", "123 MG Road, Patna",     10000),
            ("Aditya",    "0000000000", "45 Gandhi Nagar, Patna",  5000),
            ("Rohan",    "0000000000", "78 Lake View, Patna",     8000),
            ("Ramu",    "0000000000", "12 Station Road, Patna",  3000),
            ("Sumu",  "0000000000", "56 Old Market, Patna",    7000),
        ]
        cur.executemany("""
            INSERT INTO customers (name, phone, address, credit_limit)
            VALUES (?,?,?,?)
        """, customers)

    # Suppliers
    cur.execute("SELECT COUNT(*) FROM suppliers")
    if cur.fetchone()[0] == 0:
        suppliers = [
            ("Patna Wholesale Hub",  "9900112233", "wholesale@hub.in",   "Boring Road, Patna",    "10GTRIJ4748T1D5"),
            ("Bihar Dairy Supplies", "9900223344", "dairy@bihar.in",     "Frazer Road, Patna",    "10IDBGU4796G1F5"),
            ("National Distributors","9900334455", "national@dist.in",   "Exhibition Road, Patna","10HSIEJ1259H1E5"),
        ]
        cur.executemany("""
            INSERT INTO suppliers (name, phone, email, address, gstin)
            VALUES (?,?,?,?,?)
        """, suppliers)

    # Sample invoices + credits
    cur.execute("SELECT COUNT(*) FROM invoices")
    if cur.fetchone()[0] == 0:
        _seed_invoices(cur)

    conn.commit()


def _seed_invoices(cur):
    """Create a few sample invoices."""
    from datetime import datetime, timedelta
    import random

    dates = [
        datetime.now() - timedelta(days=i)
        for i in range(6, -1, -1)
    ]

    inv_num = 1001
    for d in dates:
        dt_str = d.strftime("%Y-%m-%d %H:%M:%S")
        total = round(random.uniform(200, 2000), 2)
        paid = total if random.random() > 0.3 else round(total * random.uniform(0, 0.8), 2)
        status = "paid" if paid >= total else ("partial" if paid > 0 else "credit")
        customer_id = random.choice([None, 1, 2, 3, 4, 5])

        cur.execute("""
            INSERT INTO invoices
              (invoice_number, customer_id, subtotal, total, paid_amount, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (f"INV-{inv_num}", customer_id, total, total, paid, status, dt_str))
        invoice_id = cur.lastrowid

        # Add 1-3 items
        items_count = random.randint(1, 3)
        for _ in range(items_count):
            product_id = random.randint(1, 14)
            qty = random.randint(1, 5)
            price = round(random.uniform(10, 250), 2)
            item_total = round(qty * price, 2)
            cur.execute("""
                INSERT INTO invoice_items
                  (invoice_id, product_id, product_name, qty, price, total)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (invoice_id, product_id, f"Product {product_id}", qty, price, item_total))

        # Credit entry if not fully paid
        if status in ("partial", "credit") and customer_id:
            balance = round(total - paid, 2)
            cur.execute("""
                INSERT INTO credits
                  (customer_id, invoice_id, amount, balance, type, created_at)
                VALUES (?, ?, ?, ?, 'debit', ?)
            """, (customer_id, invoice_id, balance, balance, dt_str))

        inv_num += 1


# ─── HELPER QUERIES ──────────────────────────────────────────────────────────

def get_dashboard_stats():
    conn = get_connection()
    cur = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")

    cur.execute("""
        SELECT COALESCE(SUM(total), 0) as sales,
               COALESCE(SUM(paid_amount), 0) as collected,
               COUNT(*) as invoices
        FROM invoices WHERE DATE(created_at) = ?
    """, (today,))
    today_row = dict_row(cur.fetchone())

    cur.execute("""
        SELECT COALESCE(SUM(balance), 0) as total_udhaar
        FROM (
            SELECT customer_id, SUM(CASE WHEN type='debit' THEN amount ELSE -amount END) as balance
            FROM credits GROUP BY customer_id
        ) WHERE balance > 0
    """)
    udhaar = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM products WHERE is_active=1")
    total_products = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*) FROM products
        WHERE stock_qty <= low_stock_alert AND is_active=1
    """)
    low_stock = cur.fetchone()[0]

    cur.execute("""
        SELECT i.invoice_number, i.total, i.status, i.created_at,
               COALESCE(c.name, 'Walk-in') as customer_name
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id
        ORDER BY i.created_at DESC LIMIT 5
    """)
    recent = dict_rows(cur.fetchall())

    cur.execute("""
        SELECT name, stock_qty, low_stock_alert
        FROM products WHERE stock_qty <= low_stock_alert AND is_active=1
        ORDER BY stock_qty ASC LIMIT 5
    """)
    low_stock_items = dict_rows(cur.fetchall())

    conn.close()
    return {
        "today_sales": today_row["sales"],
        "today_invoices": today_row["invoices"],
        "pending_udhaar": udhaar,
        "total_products": total_products,
        "low_stock_count": low_stock,
        "recent_transactions": recent,
        "low_stock_items": low_stock_items,
    }


def next_invoice_number():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 1")
    row = cur.fetchone()
    conn.close()
    if row:
        try:
            num = int(row[0].split("-")[1]) + 1
        except Exception:
            num = 1001
    else:
        num = 1001
    return f"INV-{num}"
