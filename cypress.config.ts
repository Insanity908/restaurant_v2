import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:8081',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    fixturesFolder: 'cypress/fixtures',
    
    video: false,
    videoCompression: 32,
    videosFolder: 'cypress/videos',

    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    pageLoadTimeout: 30000, // Tempo para carregar página
    viewportWidth: 1280,
    viewportHeight: 800,
    retries: { runMode: 0, openMode: 0 },
    env: {
      // Nunca aponta para o Supabase real: todos os specs interceptam
      // **/rest/v1/**, **/auth/v1/** e **/functions/v1/** antes de qualquer
      // pedido sair do browser — ver cypress/support/commands.ts.
    },
  },
});
