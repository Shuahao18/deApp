import React from 'react';
import * as ReactDOM from 'react-dom/client';
import Dashboard from './pages/Dashboard';
import Contribution from './pages/Contribution'; // ✅ Make sure this path is correct
import { Sidebar } from 'lucide-react';

const App = () => {
  return (
    <Dashboard/>
  );
};

function render() {
  const root = ReactDOM.createRoot(document.getElementById('app')!);
  root.render(<App />);
}

render();
