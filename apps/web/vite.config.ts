import { defineConfig } from 'vite';
import vinext from 'vinext';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({resolve:{alias:[{find:/^@prisma\/client$/,replacement:'@prisma/client/edge'}]},plugins:[vinext(),cloudflare({viteEnvironment:{name:'rsc',childEnvironments:['ssr']}}),tailwindcss()],server:{host:'127.0.0.1',port:3000}});
