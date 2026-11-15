def monthly_report(db, customer_ids):
    rows = []
    for customer_id in customer_ids:
        rows.append(db.query("SELECT total FROM invoices WHERE customer = %s", (customer_id,)))
    return rows
