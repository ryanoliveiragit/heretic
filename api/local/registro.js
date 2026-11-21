// /api/local/registro: o porteiro do computador do 451 avisa o endereço do túnel (2 níveis não passam pelo [[...route]]).
import { handle } from 'hono/vercel';
import { app } from '../../src/app.js';
export const config = { runtime: 'edge' };
export default handle(app);
