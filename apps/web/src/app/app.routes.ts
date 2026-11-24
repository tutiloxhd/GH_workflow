import type { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Iniciar sesión · GrupoHouse',
    loadComponent: () => import('./pages/login/login-page').then((page) => page.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/app-shell/app-shell').then((shell) => shell.AppShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Remates · GrupoHouse',
        loadComponent: () => import('./pages/home/home-page').then((page) => page.HomePage),
      },
      {
        path: 'mis-tareas',
        title: 'Mis tareas · GrupoHouse',
        loadComponent: () =>
          import('./pages/my-tasks/my-tasks-page').then((page) => page.MyTasksPage),
      },
      {
        path: 'workflows/:workflowId',
        title: 'Remate · GrupoHouse',
        loadComponent: () =>
          import('./pages/workflow/workflow-page').then((page) => page.WorkflowPage),
      },
      {
        path: 'panel-de-control',
        canActivate: [adminGuard],
        title: 'Panel de control · GrupoHouse',
        loadComponent: () =>
          import('./pages/control-panel/control-panel-page').then((page) => page.ControlPanelPage),
      },
      {
        path: 'usuarios',
        canActivate: [adminGuard],
        title: 'Gestor de usuarios · GrupoHouse',
        loadComponent: () => import('./pages/users/users-page').then((page) => page.UsersPage),
      },
      {
        path: 'flujos',
        canActivate: [adminGuard],
        title: 'Flujos · GrupoHouse',
        loadComponent: () =>
          import('./pages/workflow-templates/templates-page').then((page) => page.TemplatesPage),
      },
      {
        path: 'flujos/:templateId',
        canActivate: [adminGuard],
        title: 'Editar flujo · GrupoHouse',
        loadComponent: () =>
          import('./pages/workflow-templates/template-editor-page').then(
            (page) => page.TemplateEditorPage,
          ),
      },
      {
        path: 'sincronizacion',
        canActivate: [adminGuard],
        title: 'Sincronización · GrupoHouse',
        loadComponent: () => import('./pages/sync/sync-page').then((page) => page.SyncPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
