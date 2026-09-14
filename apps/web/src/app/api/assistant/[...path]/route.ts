import { api } from '../../../../server/http';
import { assistantRoute } from '../../../../server/ai/workflow';
export const GET=api(assistantRoute);
export const DELETE=api(assistantRoute);
