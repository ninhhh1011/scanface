import { afterEach,beforeEach,it,expect,vi } from 'vitest';
import { generateJson,embedQuery,providerConfig } from '../src/server/ai/provider';
import { answerSchema } from '../src/server/ai/guards';
beforeEach(()=>{for(const kind of ['LLM','EMBEDDING']){vi.stubEnv(`${kind}_PROVIDER`,'openai');vi.stubEnv(`${kind}_BASE_URL`,'https://api.openai.com/v1');vi.stubEnv(`${kind}_API_KEY`,'test-only-placeholder');vi.stubEnv(`${kind}_MODEL`,'test-only-model');}vi.stubEnv('EMBEDDING_DIMENSION','3');});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('missing config fails explicitly without a fetch or canned answer',()=>{
  vi.stubEnv('LLM_API_KEY','');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  expect(()=>providerConfig('LLM')).toThrow('Chưa cấu hình');expect(fetch).not.toHaveBeenCalled();
});
it('fake provider verifies exact request, token budget and non-streaming response validation',async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answer:'Dữ liệu kiểm thử.',citation_ids:[]})}}]}));vi.stubGlobal('fetch',fetch);
  expect((await generateJson('JSON only',{message:'test'},answerSchema)).answer).toBe('Dữ liệu kiểm thử.');
  const body=JSON.parse(fetch.mock.calls[0][1].body);expect(body.stream).toBe(false);expect(body.store).toBe(false);expect(body.max_completion_tokens).toBe(2000);
});
it('fake provider rejects malformed JSON and incomplete output',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]})));
  await expect(generateJson('JSON',{},answerSchema)).rejects.toMatchObject({code:'AI_PROVIDER_INVALID'});
});
it('fake embeddings reject dimensions, zero vectors and nonfinite values',async()=>{
  for(const embedding of [[1,2],[0,0,0],[1,null,2]]){
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({data:[{index:0,embedding}]})));
    await expect(embedQuery('test')).rejects.toMatchObject({code:'AI_EMBEDDING_INVALID'});
  }
});
