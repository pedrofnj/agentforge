def get_profile(db, current_user, profile_id):
    row = db.query(
        "SELECT * FROM profiles WHERE id = %s AND owner_id = %s",
        (profile_id, current_user.id),
    )
    if row is None:
        raise PermissionError("not found")
    return row
