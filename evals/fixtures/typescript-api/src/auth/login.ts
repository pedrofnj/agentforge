export async function login(req: any, db: any) {
  const user = await db.users.findByEmail(req.body.email);
  if (user && user.password === req.body.password) {
    return { token: user.id };
  }
  return { error: 'invalid' };
}
