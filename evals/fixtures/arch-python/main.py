from shop import handlers, orders, reports

ROUTES = {"/checkout": handlers.checkout, "/revenue": reports.revenue, "/orders": orders.create_order}
