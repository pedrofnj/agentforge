from shop import billing, orders


def revenue():
    return sum(sum(i["price"] for i in items) for items in orders._ORDERS.values()) * (
        1 + billing._RATES["default"]
    )
