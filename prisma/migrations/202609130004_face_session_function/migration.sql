-- Restricted face worker can lock current session without UPDATE grants on users/employees.
CREATE FUNCTION public.face_session_scope(p_session text,p_actor text,p_employee text)
RETURNS TABLE(employee_id text,role text,status text,capabilities text[])
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT u.employee_id,u.role,e.status,u.capabilities
 FROM public.sessions s JOIN public.users u ON u.id=s.user_id
 JOIN public.employees e ON e.id=p_employee
 WHERE s.id=p_session AND u.id=p_actor AND NOT u.locked AND s.expires_at>now()
 FOR SHARE OF s,u,e
$$;
REVOKE ALL ON FUNCTION public.face_session_scope(text,text,text) FROM PUBLIC;
