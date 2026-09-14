import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex,hexToBytes } from '@noble/hashes/utils.js';
import { timingSafeEqual as equalBytes } from 'node:crypto';
const options={N:16384,r:8,p:5,dkLen:32};
export async function hashPassword(password:string){const salt=crypto.getRandomValues(new Uint8Array(16));return `scrypt-v2:${bytesToHex(salt)}:${bytesToHex(await scryptAsync(password,salt,options))}`;}
export async function verifyPassword(password:string,encoded:string){try{const [algorithm,salt,hash]=encoded.split(':');if(!['scrypt','scrypt-v2'].includes(algorithm))return false;return equalBytes(await scryptAsync(password,hexToBytes(salt),{...options,p:algorithm==='scrypt'?1:5}),hexToBytes(hash));}catch{return false;}}
export async function tokenHash(token:string){return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));}
