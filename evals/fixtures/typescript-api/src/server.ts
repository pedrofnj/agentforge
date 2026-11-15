import { login } from './auth/login';
import { getDocument } from './routes/documents';

export const routes = { 'POST /login': login, 'GET /documents/:id': getDocument };
