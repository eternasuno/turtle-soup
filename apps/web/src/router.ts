import { pageRoutes } from 'virtual:file-routes';
import { createRouter, type RouteDefinition } from '@solidjs/router';
import { fileRoutes } from '@solidjs/router/fs';

export const Router = createRouter({
  routes: fileRoutes(pageRoutes) as unknown as readonly RouteDefinition[],
});
