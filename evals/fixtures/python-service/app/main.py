from app import auth, orders


def route(path, handler):
    ROUTES[path] = handler


ROUTES = {}
route("/login", auth.login)
route("/orders/<order_id>", orders.get_order)
