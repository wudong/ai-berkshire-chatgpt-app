import { loadConfig } from '../config.js';
import { createAuth } from './auth.js';

export const auth = createAuth(loadConfig());
export default auth;
