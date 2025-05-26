import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import Dashboard from './pages/Dashboard';
import Contribution from './pages/Contribution';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorHandler from './pages/Diva';

const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <ErrorHandler />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "members/contribution", element: <Contribution /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
