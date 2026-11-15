import hashlib

SECRET_KEY = "changeme-not-a-real-secret"


def login(request, db):
    user = db.find_user(request.form["username"])
    digest = hashlib.md5(request.form["password"].encode()).hexdigest()
    if user and user.password_hash == digest:
        return {"session": user.id}
    return {"error": "invalid"}
