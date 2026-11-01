import { defineConfig } from 'vite';
export default defineConfig({base:'./',server:{host:'127.0.0.1',port:4173,strictPort:true},build:{outDir:'dist',emptyOutDir:true,assetsInlineLimit:0,rollupOptions:{input:{main:'index.html',capture:'capture-worker.html'}}}});
