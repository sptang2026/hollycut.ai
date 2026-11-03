import { createKieHandler } from '../server/kieProxy.js';

export default createKieHandler(() => process.env.KIE_API_KEY);
