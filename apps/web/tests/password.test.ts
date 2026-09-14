import { it,expect } from 'vitest';
import { hashPassword,verifyPassword } from '../src/server/password';
it('versioned password hashes verify only the correct password',async()=>{
 const hash=await hashPassword('Temporary test password only');
 expect(hash.startsWith('scrypt-v2:')).toBe(true);
 expect(await verifyPassword('Temporary test password only',hash)).toBe(true);
 expect(await verifyPassword('Incorrect password',hash)).toBe(false);
 expect(await verifyPassword('anything','scrypt-v2:invalid:invalid')).toBe(false);
});
