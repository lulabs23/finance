import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// IMPORTANT : remplace 'finances' par le nom exact de ton repo GitHub.
// Si tu déploies à la racine d'un domaine custom, mets simplement '/'.
export default defineConfig({
  plugins: [react()],
  base: '/finances/',
});
