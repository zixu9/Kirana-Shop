"""
server.py - Main HTTP Server
Kirana Shop Inventory & Credit Management System

Run: python server.py
Open: http://localhost:8080
"""

import json
import os
import sys
import mimetypes
import secrets
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# ── ensure project root is on path ──────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from database import init_db, get_connection, hash_password, dict_row, dict_rows, get_dashboard_stats, next_invoice_number

HOST = "localhost"
PORT = 8080

# ── in-memory session store ─────────────────────────────────────────────────
SESSIONS = {}   # token -> user dict


# ─── UTILITY HELPERS ─────────────────────────────────────────────────────────

def json_response(handler, data, status=200):
    body = json.dumps(data, default=str).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def error_response(handler, message, status=400):
    json_response(handler, {"success": False, "error": message}, status)


def success_response(handler, data=None, message="OK"):
    payload = {"success": True, "message": message}
    if data is not None:
        payload["data"] = data
    json_response(handler, payload)


def get_token(handler):
    """Extract Bearer token from Authorization header or cookie."""
    auth = handler.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    cookie = handler.headers.get("Cookie", "")
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith("token="):
            return part[6:]
    return None


def get_current_user(handler):
    """Return user dict if session is valid, else None."""
    token = get_token(handler)
    if not token:
        return None
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT u.* FROM users u
        JOIN sessions s ON s.user_id = u.id
        WHERE s.token = ?
    """, (token,))
    user = dict_row(cur.fetchone())
    conn.close()
    return user


def require_auth(handler):
    """Returns user or sends 401 and returns None."""
    user = get_current_user(handler)
    if not user:
        error_response(handler, "Unauthorized", 401)
    return user


def read_body(handler):
    """Read and parse JSON body."""
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw)
    except Exception:
        return {}


# ─── ROUTE HANDLERS ──────────────────────────────────────────────────────────

def handle_login(handler, method):
    if method != "POST":
        error_response(handler, "Method not allowed", 405)
        return
    body = read_body(handler)
    username = body.get("username", "").strip()
    password = body.get("password", "")
    if not username or not password:
        error_response(handler, "Username and password required")
        return
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username=? AND is_active=1", (username,))
    user = dict_row(cur.fetchone())
    if not user or user["password"] != hash_password(password):
        conn.close()
        error_response(handler, "Invalid credentials", 401)
        return
    token = secrets.token_hex(32)
    cur.execute("INSERT INTO sessions (token, user_id) VALUES (?,?)", (token, user["id"]))
    conn.commit()
    conn.close()
    user.pop("password", None)
    success_response(handler, {"token": token, "user": user}, "Login successful")


def handle_logout(handler, method):
    token = get_token(handler)
    if token:
        conn = get_connection()
        conn.execute("DELETE FROM sessions WHERE token=?", (token,))
        conn.commit()
        conn.close()
    success_response(handler, message="Logged out")


def handle_me(handler, method):
    user = require_auth(handler)
    if not user:
        return
    user.pop("password", None)
    success_response(handler, user)


# ── DASHBOARD ────────────────────────────────────────────────────────────────

def handle_dashboard(handler, method):
    if not require_auth(handler):
        return
    success_response(handler, get_dashboard_stats())


# ── PRODUCTS ─────────────────────────────────────────────────────────────────

def handle_products(handler, method, product_id=None):
    if not require_auth(handler):
        return
    conn = get_connection()
    cur = conn.cursor()

    if method == "GET":
        params = parse_qs(urlparse(handler.path).query)
        search = params.get("search", [""])[0]
        category = params.get("category", [""])[0]
        low_stock = params.get("low_stock", [""])[0]

        query = """
            SELECT p.*, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE p.is_active=1
        """
        args = []
        if search:
            query += " AND (p.name LIKE ? OR p.barcode LIKE ?)"
            args += [f"%{search}%", f"%{search}%"]
        if category:
            query += " AND p.category_id=?"
            args.append(category)
        if low_stock == "1":
            query += " AND p.stock_qty <= p.low_stock_alert"
        query += " ORDER BY p.name"

        cur.execute(query, args)
        products = dict_rows(cur.fetchall())
        conn.close()
        success_response(handler, products)

    elif method == "POST":
        body = read_body(handler)
        required = ["name", "selling_price"]
        for field in required:
            if not body.get(field):
                conn.close()
                error_response(handler, f"Field '{field}' is required")
                return
        cur.execute("""
            INSERT INTO products
              (name, category_id, barcode, purchase_price, selling_price,
               stock_qty, low_stock_alert, unit)
            VALUES (?,?,?,?,?,?,?,?)
        """, (
            body["name"],
            body.get("category_id") or None,
            body.get("barcode") or None,
            float(body.get("purchase_price", 0)),
            float(body["selling_price"]),
            int(body.get("stock_qty", 0)),
            int(body.get("low_stock_alert", 10)),
            body.get("unit", "pcs"),
        ))
        conn.commit()
        new_id = cur.lastrowid
        cur.execute("SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?", (new_id,))
        product = dict_row(cur.fetchone())
        conn.close()
        success_response(handler, product, "Product added")

    elif method == "PUT" and product_id:
        body = read_body(handler)
        cur.execute("""
            UPDATE products SET
              name=?, category_id=?, barcode=?, purchase_price=?,
              selling_price=?, stock_qty=?, low_stock_alert=?, unit=?,
              updated_at=datetime('now','localtime')
            WHERE id=?
        """, (
            body["name"],
            body.get("category_id") or None,
            body.get("barcode") or None,
            float(body.get("purchase_price", 0)),
            float(body["selling_price"]),
            int(body.get("stock_qty", 0)),
            int(body.get("low_stock_alert", 10)),
            body.get("unit", "pcs"),
            product_id,
        ))
        conn.commit()
        conn.close()
        success_response(handler, message="Product updated")

    elif method == "DELETE" and product_id:
        cur.execute("UPDATE products SET is_active=0 WHERE id=?", (product_id,))
        conn.commit()
        conn.close()
        success_response(handler, message="Product deleted")

    else:
        conn.close()
        error_response(handler, "Not found", 404)


# ── CATEGORIES ───────────────────────────────────────────────────────────────

def handle_categories(handler, method):
    if not require_auth(handler):
        return
    conn = get_connection()
    cur = conn.cursor()
    if method == "GET":
        cur.execute("SELECT * FROM categories ORDER BY name")
        success_response(handler, dict_rows(cur.fetchall()))
    elif method == "POST":
        body = read_body(handler)
        name = body.get("name", "").strip()
        if not name:
            error_response(handler, "Name required")
            conn.close()
            return
        cur.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", (name,))
        conn.commit()
        cur.execute("SELECT * FROM categories WHERE name=?", (name,))
        success_response(handler, dict_row(cur.fetchone()), "Category added")
    conn.close()


# ── CUSTOMERS ────────────────────────────────────────────────────────────────

def handle_customers(handler, method, customer_id=None):
    if not require_auth(handler):
        return
    conn = get_connection()
    cur = conn.cursor()

    if method == "GET" and not customer_id:
        search = parse_qs(urlparse(handler.path).query).get("search", [""])[0]
        query = "SELECT * FROM customers WHERE is_active=1"
        args = []
        if search:
            query += " AND (name LIKE ? OR phone LIKE ?)"
            args += [f"%{search}%", f"%{search}%"]
        query += " ORDER BY name"
        cur.execute(query, args)
        customers = dict_rows(cur.fetchall())

        # Attach balance
        for c in customers:
            cur.execute("""
                SELECT COALESCE(SUM(CASE WHEN type='debit' THEN amount ELSE -amount END),0)
                FROM credits WHERE customer_id=?
            """, (c["id"],))
            c["balance"] = round(cur.fetchone()[0], 2)

        conn.close()
        success_response(handler, customers)

    elif method == "GET" and customer_id:
        cur.execute("SELECT * FROM customers WHERE id=?", (customer_id,))
        customer = dict_row(cur.fetchone())
        if not customer:
            conn.close()
            error_response(handler, "Customer not found", 404)
            return
        cur.execute("""
            SELECT COALESCE(SUM(CASE WHEN type='debit' THEN amount ELSE -amount END),0)
            FROM credits WHERE customer_id=?
        """, (customer_id,))
        customer["balance"] = round(cur.fetchone()[0], 2)

        cur.execute("""
            SELECT c.*, i.invoice_number
            FROM credits c
            LEFT JOIN invoices i ON i.id=c.invoice_id
            WHERE c.customer_id=?
            ORDER BY c.created_at DESC LIMIT 20
        """, (customer_id,))
        customer["ledger"] = dict_rows(cur.fetchall())
        conn.close()
        success_response(handler, customer)

    elif method == "POST":
        body = read_body(handler)
        if not body.get("name"):
            conn.close()
            error_response(handler, "Name required")
            return
        cur.execute("""
            INSERT INTO customers (name, phone, address, credit_limit)
            VALUES (?,?,?,?)
        """, (body["name"], body.get("phone",""), body.get("address",""), float(body.get("credit_limit",5000))))
        conn.commit()
        cid = cur.lastrowid
        cur.execute("SELECT * FROM customers WHERE id=?", (cid,))
        conn.close()
        success_response(handler, dict_row(cur.fetchone()), "Customer added")

    elif method == "PUT" and customer_id:
        body = read_body(handler)
        cur.execute("""
            UPDATE customers SET name=?, phone=?, address=?, credit_limit=? WHERE id=?
        """, (body["name"], body.get("phone",""), body.get("address",""), float(body.get("credit_limit",5000)), customer_id))
        conn.commit()
        conn.close()
        success_response(handler, message="Customer updated")

    elif method == "DELETE" and customer_id:
        cur.execute("UPDATE customers SET is_active=0 WHERE id=?", (customer_id,))
        conn.commit()
        conn.close()
        success_response(handler, message="Customer deleted")

    else:
        conn.close()
        error_response(handler, "Not found", 404)


# ── INVOICES / BILLING ────────────────────────────────────────────────────────

def handle_invoices(handler, method, invoice_id=None):
    if not require_auth(handler):
        return
    conn = get_connection()
    cur = conn.cursor()

    if method == "GET" and not invoice_id:
        params = parse_qs(urlparse(handler.path).query)
        limit = int(params.get("limit", [50])[0])
        offset = int(params.get("offset", [0])[0])
        search = params.get("search", [""])[0]

        query = """
            SELECT i.*, COALESCE(c.name,'Walk-in') as customer_name
            FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
            WHERE 1=1
        """
        args = []
        if search:
            query += " AND (i.invoice_number LIKE ? OR c.name LIKE ?)"
            args += [f"%{search}%", f"%{search}%"]
        query += " ORDER BY i.created_at DESC LIMIT ? OFFSET ?"
        args += [limit, offset]
        cur.execute(query, args)
        invoices = dict_rows(cur.fetchall())
        conn.close()
        success_response(handler, invoices)

    elif method == "GET" and invoice_id:
        cur.execute("""
            SELECT i.*, COALESCE(c.name,'Walk-in') as customer_name
            FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
            WHERE i.id=?
        """, (invoice_id,))
        invoice = dict_row(cur.fetchone())
        if not invoice:
            conn.close()
            error_response(handler, "Invoice not found", 404)
            return
        cur.execute("SELECT * FROM invoice_items WHERE invoice_id=?", (invoice_id,))
        invoice["items"] = dict_rows(cur.fetchall())
        conn.close()
        success_response(handler, invoice)

    elif method == "POST":
        body = read_body(handler)
        items = body.get("items", [])
        if not items:
            conn.close()
            error_response(handler, "No items in bill")
            return

        inv_number = next_invoice_number()
        subtotal = sum(float(i["price"]) * int(i["qty"]) for i in items)
        discount = float(body.get("discount", 0))
        tax = float(body.get("tax", 0))
        total = round(subtotal - discount + tax, 2)
        paid = float(body.get("paid_amount", total))
        customer_id = body.get("customer_id") or None
        payment_mode = body.get("payment_mode", "cash")
        balance = round(total - paid, 2)

        if balance > 0:
            status = "partial" if paid > 0 else "credit"
        else:
            status = "paid"

        cur.execute("""
            INSERT INTO invoices
              (invoice_number, customer_id, subtotal, discount, tax, total,
               paid_amount, payment_mode, status, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (inv_number, customer_id, subtotal, discount, tax, total,
              paid, payment_mode, status, body.get("notes", "")))
        inv_id = cur.lastrowid

        for item in items:
            pid = int(item["product_id"])
            qty = int(item["qty"])
            price = float(item["price"])
            item_disc = float(item.get("discount", 0))
            item_total = round(qty * price - item_disc, 2)

            cur.execute("""
                INSERT INTO invoice_items
                  (invoice_id, product_id, product_name, qty, price, discount, total)
                VALUES (?,?,?,?,?,?,?)
            """, (inv_id, pid, item["product_name"], qty, price, item_disc, item_total))

            # Deduct stock
            cur.execute("UPDATE products SET stock_qty = stock_qty - ? WHERE id=?", (qty, pid))

        # Credit entry
        if balance > 0 and customer_id:
            cur.execute("""
                INSERT INTO credits (customer_id, invoice_id, amount, balance, type, notes)
                VALUES (?,?,?,?,'debit',?)
            """, (customer_id, inv_id, balance, balance, f"Invoice {inv_number}"))

        conn.commit()
        cur.execute("SELECT * FROM invoices WHERE id=?", (inv_id,))
        invoice = dict_row(cur.fetchone())
        conn.close()
        success_response(handler, invoice, "Invoice created")

    else:
        conn.close()
        error_response(handler, "Not found", 404)


# ── CREDITS / UDHAAR ─────────────────────────────────────────────────────────

def handle_credits(handler, method):
    if not require_auth(handler):
        return
    conn = get_connection()
    cur = conn.cursor()

    if method == "GET":
        cur.execute("""
            SELECT c.id, c.name, c.phone,
                   COALESCE(SUM(CASE WHEN cr.type='debit' THEN cr.amount ELSE -cr.amount END),0) as balance
            FROM customers c
            LEFT JOIN credits cr ON cr.customer_id=c.id
            WHERE c.is_active=1
            GROUP BY c.id
            HAVING balance > 0
            ORDER BY balance DESC
        """)
        conn.close()
        success_response(handler, dict_rows(cur.fetchall()))

    elif method == "POST":
        body = read_body(handler)
        customer_id = body.get("customer_id")
        amount = float(body.get("amount", 0))
        credit_type = body.get("type", "credit")   # credit = payment received
        notes = body.get("notes", "")

        if not customer_id or amount <= 0:
            conn.close()
            error_response(handler, "customer_id and amount required")
            return

        # Get current balance
        cur.execute("""
            SELECT COALESCE(SUM(CASE WHEN type='debit' THEN amount ELSE -amount END),0)
            FROM credits WHERE customer_id=?
        """, (customer_id,))
        current_balance = cur.fetchone()[0]
        new_balance = current_balance - amount if credit_type == "credit" else current_balance + amount

        cur.execute("""
            INSERT INTO credits (customer_id, amount, balance, type, notes)
            VALUES (?,?,?,?,?)
        """, (customer_id, amount, round(new_balance, 2), credit_type, notes))
        conn.commit()
        conn.close()
        success_response(handler, {"new_balance": round(new_balance, 2)}, "Payment recorded")

    else:
        conn.close()
        error_response(handler, "Not found", 404)


# ── SUPPLIERS ─────────────────────────────────────────────────────────────────

def handle_suppliers(handler, method, supplier_id=None):
    if not require_auth(handler):
        return
    conn = get_connection()
    cur = conn.cursor()

    if method == "GET":
        cur.execute("SELECT * FROM suppliers WHERE is_active=1 ORDER BY name")
        suppliers = dict_rows(cur.fetchall())
        conn.close()
        success_response(handler, suppliers)

    elif method == "POST":
        body = read_body(handler)
        if not body.get("name"):
            conn.close()
            error_response(handler, "Name required")
            return
        cur.execute("""
            INSERT INTO suppliers (name, phone, email, address, gstin)
            VALUES (?,?,?,?,?)
        """, (body["name"], body.get("phone",""), body.get("email",""),
              body.get("address",""), body.get("gstin","")))
        conn.commit()
        sid = cur.lastrowid
        cur.execute("SELECT * FROM suppliers WHERE id=?", (sid,))
        conn.close()
        success_response(handler, dict_row(cur.fetchone()), "Supplier added")

    elif method == "PUT" and supplier_id:
        body = read_body(handler)
        cur.execute("""
            UPDATE suppliers SET name=?,phone=?,email=?,address=?,gstin=? WHERE id=?
        """, (body["name"], body.get("phone",""), body.get("email",""),
              body.get("address",""), body.get("gstin",""), supplier_id))
        conn.commit()
        conn.close()
        success_response(handler, message="Supplier updated")

    elif method == "DELETE" and supplier_id:
        cur.execute("UPDATE suppliers SET is_active=0 WHERE id=?", (supplier_id,))
        conn.commit()
        conn.close()
        success_response(handler, message="Supplier deleted")

    else:
        conn.close()
        error_response(handler, "Not found", 404)


# ── PURCHASES ────────────────────────────────────────────────────────────────

def handle_purchases(handler, method):
    if not require_auth(handler):
        return
    conn = get_connection()
    cur = conn.cursor()

    if method == "GET":
        cur.execute("""
            SELECT pu.*, p.name as product_name, s.name as supplier_name
            FROM purchases pu
            LEFT JOIN products p ON p.id=pu.product_id
            LEFT JOIN suppliers s ON s.id=pu.supplier_id
            ORDER BY pu.created_at DESC LIMIT 50
        """)
        purchases = dict_rows(cur.fetchall())
        conn.close()
        success_response(handler, purchases)

    elif method == "POST":
        body = read_body(handler)
        product_id = body.get("product_id")
        qty = int(body.get("qty", 0))
        purchase_price = float(body.get("purchase_price", 0))
        if not product_id or qty <= 0:
            conn.close()
            error_response(handler, "product_id and qty required")
            return

        total = round(qty * purchase_price, 2)
        paid = float(body.get("paid", total))

        cur.execute("""
            INSERT INTO purchases (supplier_id, product_id, qty, purchase_price, total, paid, notes)
            VALUES (?,?,?,?,?,?,?)
        """, (body.get("supplier_id"), product_id, qty, purchase_price, total, paid, body.get("notes","")))

        # Update stock and purchase price
        cur.execute("""
            UPDATE products SET stock_qty=stock_qty+?, purchase_price=?,
            updated_at=datetime('now','localtime') WHERE id=?
        """, (qty, purchase_price, product_id))
        conn.commit()
        conn.close()
        success_response(handler, message="Purchase recorded, stock updated")

    else:
        conn.close()
        error_response(handler, "Not found", 404)


# ── REPORTS ──────────────────────────────────────────────────────────────────

def handle_reports(handler, method, report_type=None):
    if not require_auth(handler):
        return
    conn = get_connection()
    cur = conn.cursor()

    if report_type == "daily":
        params = parse_qs(urlparse(handler.path).query)
        date = params.get("date", [None])[0]
        if not date:
            from datetime import datetime
            date = datetime.now().strftime("%Y-%m-%d")

        cur.execute("""
            SELECT DATE(created_at) as date,
                   COUNT(*) as invoices,
                   SUM(total) as revenue,
                   SUM(paid_amount) as collected,
                   SUM(total-paid_amount) as pending
            FROM invoices
            WHERE DATE(created_at)=?
        """, (date,))
        summary = dict_row(cur.fetchone())

        cur.execute("""
            SELECT ii.product_name, SUM(ii.qty) as qty_sold, SUM(ii.total) as revenue
            FROM invoice_items ii
            JOIN invoices i ON i.id=ii.invoice_id
            WHERE DATE(i.created_at)=?
            GROUP BY ii.product_name
            ORDER BY revenue DESC
        """, (date,))
        products = dict_rows(cur.fetchall())

        conn.close()
        success_response(handler, {"summary": summary, "top_products": products, "date": date})

    elif report_type == "monthly":
        params = parse_qs(urlparse(handler.path).query)
        month = params.get("month", [None])[0]
        if not month:
            from datetime import datetime
            month = datetime.now().strftime("%Y-%m")

        cur.execute("""
            SELECT DATE(created_at) as date,
                   COUNT(*) as invoices,
                   SUM(total) as revenue,
                   SUM(paid_amount) as collected
            FROM invoices
            WHERE strftime('%Y-%m', created_at)=?
            GROUP BY DATE(created_at)
            ORDER BY date
        """, (month,))
        daily = dict_rows(cur.fetchall())

        cur.execute("""
            SELECT COUNT(*) as total_invoices,
                   SUM(total) as total_revenue,
                   SUM(paid_amount) as total_collected,
                   SUM(total-paid_amount) as total_pending
            FROM invoices
            WHERE strftime('%Y-%m', created_at)=?
        """, (month,))
        summary = dict_row(cur.fetchone())

        conn.close()
        success_response(handler, {"summary": summary, "daily_breakdown": daily, "month": month})

    elif report_type == "profit":
        params = parse_qs(urlparse(handler.path).query)
        month = params.get("month", [None])[0]
        if not month:
            from datetime import datetime
            month = datetime.now().strftime("%Y-%m")

        cur.execute("""
            SELECT ii.product_name,
                   SUM(ii.qty) as qty_sold,
                   SUM(ii.total) as revenue,
                   SUM(ii.qty * p.purchase_price) as cost,
                   SUM(ii.total) - SUM(ii.qty * p.purchase_price) as profit
            FROM invoice_items ii
            JOIN invoices i ON i.id=ii.invoice_id
            JOIN products p ON p.id=ii.product_id
            WHERE strftime('%Y-%m', i.created_at)=?
            GROUP BY ii.product_id
            ORDER BY profit DESC
        """, (month,))
        products = dict_rows(cur.fetchall())

        total_revenue = sum(p["revenue"] or 0 for p in products)
        total_cost = sum(p["cost"] or 0 for p in products)
        total_profit = round(total_revenue - total_cost, 2)

        conn.close()
        success_response(handler, {
            "products": products,
            "total_revenue": total_revenue,
            "total_cost": total_cost,
            "total_profit": total_profit,
            "month": month,
        })

    elif report_type == "credit":
        cur.execute("""
            SELECT c.id, c.name, c.phone,
                   COALESCE(SUM(CASE WHEN cr.type='debit' THEN cr.amount ELSE -cr.amount END),0) as balance
            FROM customers c
            LEFT JOIN credits cr ON cr.customer_id=c.id
            WHERE c.is_active=1
            GROUP BY c.id
            ORDER BY balance DESC
        """)
        customers = dict_rows(cur.fetchall())
        total = sum(c["balance"] for c in customers if c["balance"] > 0)
        conn.close()
        success_response(handler, {"customers": customers, "total_pending": round(total,2)})

    else:
        conn.close()
        error_response(handler, "Unknown report type", 404)


# ─── MAIN REQUEST HANDLER ─────────────────────────────────────────────────────

class KiranaHandler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        # Custom log format
        print(f"[{self.address_string()}] {format % args}")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization")
        self.end_headers()

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def do_PUT(self):
        self._route("PUT")

    def do_DELETE(self):
        self._route("DELETE")

    def _route(self, method):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        # ── Static files ────────────────────────────────────────────────────
        if path == "/" or path == "/index.html":
            self._serve_file(os.path.join(BASE_DIR, "templates", "index.html"))
            return

        if not path.startswith("/api/"):
            # Serve from static/ or templates/
            file_path = None
            if path.startswith("/static/"):
                file_path = os.path.join(BASE_DIR, path.lstrip("/"))
            else:
                file_path = os.path.join(BASE_DIR, "templates", path.lstrip("/"))

            if file_path and os.path.isfile(file_path):
                self._serve_file(file_path)
            else:
                # SPA fallback
                self._serve_file(os.path.join(BASE_DIR, "templates", "index.html"))
            return

        # ── API Routes ──────────────────────────────────────────────────────
        segments = path.split("/")
        # /api/xxx or /api/xxx/id

        try:
            if path == "/api/login":
                handle_login(self, method)

            elif path == "/api/logout":
                handle_logout(self, method)

            elif path == "/api/me":
                handle_me(self, method)

            elif path == "/api/dashboard":
                handle_dashboard(self, method)

            elif path == "/api/products" or (len(segments) == 4 and segments[2] == "products"):
                pid = int(segments[3]) if len(segments) == 4 else None
                handle_products(self, method, pid)

            elif path == "/api/categories":
                handle_categories(self, method)

            elif path == "/api/customers" or (len(segments) == 4 and segments[2] == "customers"):
                cid = int(segments[3]) if len(segments) == 4 else None
                handle_customers(self, method, cid)

            elif path == "/api/invoices" or (len(segments) == 4 and segments[2] == "invoices"):
                iid = int(segments[3]) if len(segments) == 4 else None
                handle_invoices(self, method, iid)

            elif path == "/api/credits":
                handle_credits(self, method)

            elif path == "/api/suppliers" or (len(segments) == 4 and segments[2] == "suppliers"):
                sid = int(segments[3]) if len(segments) == 4 else None
                handle_suppliers(self, method, sid)

            elif path == "/api/purchases":
                handle_purchases(self, method)

            elif len(segments) >= 4 and segments[2] == "reports":
                report_type = segments[3] if len(segments) > 3 else None
                handle_reports(self, method, report_type)

            else:
                error_response(self, "Route not found", 404)

        except ValueError as e:
            error_response(self, f"Invalid ID: {e}", 400)
        except Exception as e:
            import traceback
            traceback.print_exc()
            error_response(self, f"Server error: {e}", 500)

    def _serve_file(self, file_path):
        if not os.path.isfile(file_path):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"File not found")
            return
        mime, _ = mimetypes.guess_type(file_path)
        mime = mime or "application/octet-stream"
        with open(file_path, "rb") as f:
            content = f.read()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


# ─── ENTRY POINT ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    server = HTTPServer((HOST, PORT), KiranaHandler)
    print(f"""
╔══════════════════════════════════════════════╗
║   🛒  Kirana Shop Management System          ║
║   Running at: http://{HOST}:{PORT}          ║
║   Press Ctrl+C to stop                       ║
║                                              ║
║   Default login:  admin / admin123           ║
╚══════════════════════════════════════════════╝
""")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped.")
        server.server_close()
