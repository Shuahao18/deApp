import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import Dashboard from './pages/Dashboard';
import Contribution from './pages/Contribution';
import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorHandler from './pages/Diva';
import CalendarEvent from './pages/CalendarEvent';
import AdminLogin from './components/AdminLogin';
import Expenses from './pages/Expenses';
import ProtectedRoute from './components/Protectedroute';
import Folder from './pages/Folder';
import Complaints from './pages/Complaints';
import "./App.css"; // make sure this is in your main file

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
          { path: 'members/expenses', element: <Expenses /> },
          { path: 'folder', element: <Folder /> },
          { path: 'complaints', element: <Complaints /> },


          { path: '', element: <Navigate to="dashboard" replace /> }, // Empty path redirects to dashboard
          { path: '*', element: <Navigate to="dashboard" replace /> }, // 404 fallback
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
