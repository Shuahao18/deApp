// main.tsx or index.tsx
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import Dashboard from './pages/Dashboard';
import Contribution from './pages/Contribution';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorHandler from './pages/Diva';
import CalendarEvent from './pages/CalendarEvent';
import AdminLogin from './components/AdminLogin';
import ProtectedRoute from './components/Protectedroute';

const router = createHashRouter([
  {
    path: '/',
    element: <AdminLogin />, // Show login first
  },
  {
    path: '/',
    element: <ProtectedRoute />, // Protect below routes
    children: [
      {
        element: <Layout />,
        errorElement: <ErrorHandler />,
        children: [
          { path: 'dashboard', element: <Dashboard /> },
          { path: 'members/contribution', element: <Contribution /> },
          { path: 'calendarEvent', element: <CalendarEvent /> },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
