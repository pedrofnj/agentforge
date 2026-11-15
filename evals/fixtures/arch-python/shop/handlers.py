import smtplib


def checkout(request, db):
    items = request.json["items"]
    total = sum(i["price"] for i in items)
    if total > 100:
        total = total * 0.9
    db.execute("INSERT INTO orders (total) VALUES (%s)", (total,))
    server = smtplib.SMTP("localhost")
    server.sendmail("shop@example.com", request.json["email"], f"Total: {total}")
    return {"total": total}
