import { api } from '../../../../server/http';
import { authRoute } from '../../../../server/auth';
const handler=api(request=>authRoute(request,new URL(request.url).pathname.split('/').at(-1)!));
export {handler as GET,handler as POST};
