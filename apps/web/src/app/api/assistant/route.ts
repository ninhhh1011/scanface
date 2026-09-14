import { api } from '../../../server/http';
import { assistantRoute } from '../../../server/ai/workflow';
export const POST=api(assistantRoute);
