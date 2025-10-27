import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import Dashboard from "./pages/Dashboard";
import Contribution from "./pages/Contribution";
import { createHashRouter, RouterProvider, Navigate, useNavigate } from "react-router-dom";
import Layout from "./components/Layout";
import ErrorHandler from "./pages/Diva";
import CalendarEvent from "./pages/CalendarEvent";
import AdminLogin from "./components/AdminLogin";
import Expenses from "./pages/Expenses";
import ProtectedRoute from "./components/Protectedroute";
import Folder from "./pages/Folder";
import Complaints from "./pages/Complaints";
import Election from "./pages/Election";
import MemAssoc from "./pages/MemAssoc";
import AccReg from "./pages/AccReg";
import Posting from "./pages/Posting";
import "./App.css";
import OffHoa from "./pages/OffHoa";
import EditModal from "./pages/EditModal"

// Create a Dashboard Wrapper to handle navigation
function DashboardWrapper() {
  const navigate = useNavigate();

  const handleViewComplaints = () => {
    navigate('/complaints');
  };

  const handleViewContributions = () => {
    navigate('/accounting/contribution');
  };

  const handleViewEvents = () => {
    navigate('/calendarEvent');
  };

  return (
    <Dashboard
      adminUsername="HOA Administrator"
      onViewComplaintsClick={handleViewComplaints}
      onViewContributionsClick={handleViewContributions}
      onViewEventsClick={handleViewEvents}
    />
  );
}

const router = createHashRouter([
  {
    path: "/",
    element: <AdminLogin />,
  },
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        errorElement: <ErrorHandler />,
        children: [
          { 
            path: "dashboard", 
            element: <DashboardWrapper /> // Use the wrapper instead
          },
          { path: "contribution", element: <Contribution /> },
          { path: "calendarEvent", element: <CalendarEvent /> },
          { path: "members/expenses", element: <Expenses /> },
          { path: "folder", element: <Folder /> },
          { path: "complaints", element: <Complaints /> },
          { path: "editModal", element: <EditModal /> },
          { path: "posting", element: <Posting /> },
          { path: "officials", element: <OffHoa /> },
          { path: "accounting/contribution", element: <Contribution /> },
          { path: "accounting/expenses", element: <Expenses /> },
          { path: "members/memAssoc", element: <MemAssoc /> },
          { path: "accReg", element: <AccReg /> },
          { path: "election", element: <Election /> },
          { path: "", element: <Navigate to="dashboard" replace /> },
          { path: "*", element: <Navigate to="dashboard" replace /> },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);