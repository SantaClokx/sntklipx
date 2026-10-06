// .railway/railway.ts
import { defineRailway, service } from 'railway/iac';

export default defineRailway(() => {
  const api = service('sntklipx-api', {
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'Dockerfile',
    },
  });
});
