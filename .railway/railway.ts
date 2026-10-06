// .railway/railway.ts
import { defineRailwayConfig } from 'railway';

export default defineRailwayConfig({
  build: {
    builder: 'DOCKERFILE',
    dockerfilePath: 'Dockerfile',
  },
});
