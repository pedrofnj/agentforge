export async function getDocument(req: any, db: any) {
  return db.documents.findById(req.params.id);
}
