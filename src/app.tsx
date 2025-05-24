import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import Dashboard from './pages/Dashboard';
import Contribution from './pages/Contribution'; // ✅ Make sure this path is correct
import { Sidebar } from 'lucide-react';
import CalendarEvent from './pages/CalendarEvent';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorHandler from './pages/Diva';


const router= createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    errorElement: <ErrorHandler />,
    children: [
    { path:"/dashboard",element:<Dashboard/>},
    { path:"members/contribution",element:<Contribution/>},
    ],
  },
]);


 ReactDOM.createRoot(document.getElementById('app')!).render(
 <StrictMode>
  <RouterProvider router={router} />
 </StrictMode>
 );
 



