import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const DB_PATH = path.join(DATA_DIR, 'songlist.db');
export const STATIC_DIR = process.env.STATIC_DIR || path.join(ROOT, 'static');
export const PORT = Number(process.env.PORT || 8866);
export const HOST = process.env.HOST || '0.0.0.0';
