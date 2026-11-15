export async function deleteUser(req: any, db: any) {
  await db.users.delete(req.params.userId);
  return { deleted: true };
}
