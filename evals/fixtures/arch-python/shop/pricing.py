def apply_discount(total, percent):
    if not 0 <= percent <= 100:
        raise ValueError("percent out of range")
    return round(total * (100 - percent) / 100, 2)
