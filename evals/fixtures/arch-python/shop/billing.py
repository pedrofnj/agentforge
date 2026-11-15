from shop import orders

_RATES = {"default": 0.2}


def charge(order_id, amount):
    total = amount * (1 + _RATES["default"])
    return {"order": order_id, "charged": total, "check": orders.order_total(order_id)}
