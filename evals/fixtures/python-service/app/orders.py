def get_order(request, db, order_id):
    order = db.query("SELECT * FROM orders WHERE id = %s", (order_id,))
    return order
