import {describe,it,expect} from 'bun:test';
import {isAuthorizedGoogleOrigin,verifyGoogleCredential,findOrCreateGoogleUser,type GoogleIdentity} from '../server/google-auth';
import type {Sql} from 'postgres';

const alice:GoogleIdentity={sub:'google-alice-1234567',email:'alice@gmail.com',name:'Alice',picture:null};

describe('Google multi-user authentication',()=>{
  it('only permits the configured MoneyFlow website origin',()=>{
    expect(isAuthorizedGoogleOrigin('http://127.0.0.1:5178','http://localhost:5178')).toBe(true);
    expect(isAuthorizedGoogleOrigin('http://localhost:5178','http://localhost:5178')).toBe(true);
    expect(isAuthorizedGoogleOrigin('https://finance.example','https://finance.example')).toBe(true);
    expect(isAuthorizedGoogleOrigin('https://other.example','https://finance.example')).toBe(false);
    expect(isAuthorizedGoogleOrigin('','https://finance.example')).toBe(false);
  });
  it('rejects invalid Google credentials and unconfigured OAuth client',async()=>{
    await expect(verifyGoogleCredential('not-a-token','123.apps.googleusercontent.com')).rejects.toThrow('INVALID_GOOGLE_CREDENTIAL');
    await expect(verifyGoogleCredential('a.b.c','not-an-oauth-client')).rejects.toThrow('GOOGLE_CLIENT_ID_NOT_CONFIGURED');
  });
  it('creates a brand-new separate workspace with default accounts and categories',async()=>{
    const queries:string[]=[];
    const fake=async(parts:TemplateStringsArray,...args:any[])=>{
      const query=parts.join('?');queries.push(query);
      if(query.includes('SELECT user_id FROM google_links'))return [];
      if(query.includes('INSERT INTO users'))return [{id:'new-alice-user-id'}];
      return [];
    };
    const result=await findOrCreateGoogleUser(fake as unknown as Sql,alice);
    expect(result).toEqual({userId:'new-alice-user-id',created:true});
    expect(queries.filter(x=>x.includes('INSERT INTO accounts'))).toHaveLength(3);
    expect(queries.filter(x=>x.includes('INSERT INTO categories'))).toHaveLength(10);
    expect(queries.some(x=>x.includes('INSERT INTO google_links'))).toBe(true);
    expect(queries.some(x=>x.includes('SELECT pg_advisory_xact_lock'))).toBe(true);
  });
  it('reuses the existing account without creating extra users or categories',async()=>{
    const queries:string[]=[];
    const fake=async(parts:TemplateStringsArray,...args:any[])=>{
      const query=parts.join('?');queries.push(query);
      if(query.includes('SELECT user_id FROM google_links'))return [{user_id:'existing-alice-user-id'}];
      return [];
    };
    const result=await findOrCreateGoogleUser(fake as unknown as Sql,alice);
    expect(result).toEqual({userId:'existing-alice-user-id',created:false});
    expect(queries.some(x=>x.includes('INSERT INTO users'))).toBe(false);
    expect(queries.some(x=>x.includes('INSERT INTO accounts'))).toBe(false);
  });
});
