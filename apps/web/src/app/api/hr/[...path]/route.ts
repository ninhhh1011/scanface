import { api } from '../../../../server/http';
import { actorFromRequest } from '../../../../server/auth';
import { hrRoute } from '../../../../server/hr';
const handler=api(async request=>hrRoute(request,await actorFromRequest(request)));
export {handler as GET,handler as POST,handler as PATCH};
