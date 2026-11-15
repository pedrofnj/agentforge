from shop import billing

_ORDERS = {}


def create_order(order_id, items):
    _ORDERS[order_id] = items
    return billing.charge(order_id, sum(i["price"] for i in items))


def order_total(order_id):
    return sum(i["price"] for i in _ORDERS[order_id])
