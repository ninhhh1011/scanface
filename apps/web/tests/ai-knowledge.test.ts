import { it,expect } from 'vitest';
import { metadataSchema,versionSchema,knowledgeAcl } from '../src/server/ai/knowledge';
it('knowledge metadata never accepts embedded status, owner or active version',()=>{
  expect(()=>metadataSchema.parse({title:'Policy',classification:'GENERAL',allowed_roles:['EMPLOYEE'],owner_id:'other'})).toThrow();
  expect(()=>metadataSchema.parse({title:'Policy',classification:'GENERAL',allowed_roles:['EVERYONE']})).toThrow();
  expect(()=>versionSchema.parse({version:'1',effective_from:'2026-01-01',effective_to:'2025-01-01'})).toThrow();
  expect(()=>versionSchema.parse({version:'1',effective_from:null})).toThrow();
});
it('knowledge ACL restricts confidential content even if roles are accidentally broad',()=>{
  const employee={id:'u',email:'u@test.example',role:'EMPLOYEE',employee_id:'e',capabilities:[]};
  expect(knowledgeAcl(employee)).toEqual({allowed_roles:{has:'EMPLOYEE'},classification:'GENERAL'});
  expect(knowledgeAcl({...employee,capabilities:['documents:sensitive']})).toEqual({allowed_roles:{has:'EMPLOYEE'}});
});
