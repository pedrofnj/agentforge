export async function syncDocuments(api: any, db: any) {
  try {
    const docs = await api.fetchAll();
    await db.documents.upsertMany(docs);
  } catch (e) {}
}
